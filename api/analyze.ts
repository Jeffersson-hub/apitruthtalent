import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Configuration du worker PDF.js
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

// ============================================
// HEADERS CORS
// ============================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400'
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("--- DÉBUT ANALYSE TRUTHTALENT ---");

  // ============================================
  // GESTION DES REQUÊTES OPTIONS (CORS)
  // ============================================
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  // Ajouter les headers CORS à toutes les réponses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    const { filePath } = req.body;
    if (!filePath) {
      throw new Error("Le chemin du fichier (filePath) est manquant.");
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Téléchargement du fichier depuis Supabase
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) throw downloadError;

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // 2. Extraction du texte selon le format
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const loadingTask = pdfjs.getDocument({ 
        data: new Uint8Array(arrayBuffer),
        useSystemFonts: true 
      });
      const pdf = await loadingTask.promise;
      let fullContent: string[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        const items = content.items as any[];
        items.sort((a, b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 5) {
            return b.transform[5] - a.transform[5];
          }
          return a.transform[4] - b.transform[4];
        });

        let lastY = -1;
        let pageText = "";
        for (const item of items) {
          if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 5) {
            pageText += "\n";
          }
          pageText += item.str + " ";
          lastY = item.transform[5];
        }
        fullContent.push(pageText);
      }
      rawText = fullContent.join("\n--- PAGE ---\n");
    } else {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    if (!rawText.trim()) {
      throw new Error("Extraction impossible : texte vide.");
    }

    // 3. Extraction des contacts
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
    const emailSecu = emailMatch ? emailMatch[0].toLowerCase() : null;
    const telSecu = phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : null;

    // 4. Appel Groq
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { 
            role: "system", 
            content: `Tu es un expert RH. Analyse le CV et extrais en JSON :
              - nom, prenom, email, telephone
              - niveau : Choisis strictement parmi [CAP, Bac, BTS, DEUG, Licence, Master, Doctorat].
              - metiers : Liste des titres de postes principaux (ex: ["Développeur Fullstack", "Chef de Projet"]). 
              - competences : Liste de mots-clés techniques.
              - experiences : Liste d'objets { poste, entreprise, periode, description }.
              Réponds UNIQUEMENT en JSON.` 
          },
          { role: "user", content: rawText }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    const aiRes = await groqResponse.json();
    const parsed = JSON.parse(aiRes.choices[0].message.content);

    // 5. Structure de réponse
    const finalData = {
      nom: parsed.nom || "Inconnu",
      prenom: parsed.prenom || "Inconnu",
      email: emailSecu || parsed.email,
      telephone: telSecu || parsed.telephone,
      niveau: parsed.niveau || null,
      metiers: parsed.metiers || [],
      competences: parsed.competences || [],
      experiences: parsed.experiences || [],
      fichier: filePath
    };

    console.log("✅ Extraction OK pour:", finalData.email);

    return res.status(200).json({ 
      success: true, 
      data: finalData,
      raw_text: rawText 
    });

  } catch (error: any) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}