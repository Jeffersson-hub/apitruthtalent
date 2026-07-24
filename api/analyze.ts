// api/analyze.ts
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// ============================================
// CORS HEADERS
// ============================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ============================================
// EXPORT DU HANDLER
// ============================================
export default async function handler(req: any, res: any) {
  // Gestion CORS - OPTIONS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  // CORS - Toutes les réponses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: 'filePath requis' 
      });
    }

    console.log('📁 Fichier à analyser:', filePath);

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Télécharger le fichier
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      console.error('❌ Erreur téléchargement:', downloadError);
      return res.status(500).json({
        success: false,
        error: `Erreur téléchargement: ${downloadError.message}`
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = '';

    // Extraire le texte
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdfParse(buffer);
      rawText = data.text;
    } else if (filePath.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Format non supporté. Utilisez PDF ou DOCX.'
      });
    }

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Le fichier est vide ou n\'a pas pu être analysé'
      });
    }

    console.log('📝 Texte extrait, longueur:', rawText.length);

    // Extraction des contacts (fallback)
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);

    // Appel Groq (si clé disponible)
    let parsed = null;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (groqApiKey) {
      try {
        console.log('🤖 Appel Groq...');
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: `Tu es un expert RH. Analyse le CV et extrais en JSON UNIQUEMENT :
                  - nom, prenom
                  - niveau (CAP, Bac, BTS, DEUG, Licence, Master, Doctorat)
                  - metiers (array)
                  - competences (array)
                  - experiences (array d'objets { poste, entreprise, periode, description })
                  Réponds UNIQUEMENT en JSON valide.`
              },
              { role: 'user', content: rawText.substring(0, 8000) }
            ],
            response_format: { type: 'json_object' },
            temperature: 0
          })
        });

        if (groqResponse.ok) {
          const aiRes = await groqResponse.json();
          try {
            parsed = JSON.parse(aiRes.choices[0].message.content);
            console.log('✅ Groq a répondu');
          } catch (e) {
            console.warn('⚠️ Réponse Groq non-JSON');
          }
        }
      } catch (groqError: any) {
        console.warn('⚠️ Erreur Groq:', groqError.message);
      }
    }

    // Fallback si Groq échoue
    if (!parsed) {
      parsed = {
        nom: 'Inconnu',
        prenom: 'Inconnu',
        niveau: null,
        metiers: [],
        competences: [],
        experiences: []
      };
    }

    // Réponse
    const finalData = {
      nom: parsed.nom || 'Inconnu',
      prenom: parsed.prenom || 'Inconnu',
      email: emailMatch ? emailMatch[0] : null,
      telephone: phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : null,
      niveau: parsed.niveau || null,
      metiers: parsed.metiers || [],
      competences: parsed.competences || [],
      experiences: parsed.experiences || [],
      fichier: filePath,
      raw_text: rawText.substring(0, 2000)
    };

    console.log('✅ Analyse terminée');

    return res.status(200).json({
      success: true,
      data: finalData
    });

  } catch (error: any) {
    console.error('❌ Erreur API:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur interne'
    });
  }
}