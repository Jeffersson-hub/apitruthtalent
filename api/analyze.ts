import mammoth from "mammoth";
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Headers CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { filePath } = req.body;
    if (!filePath) throw new Error("Le chemin du fichier (filePath) est requis");

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Téléchargement du fichier depuis Supabase
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !fileData) throw new Error(`Fichier introuvable: ${downloadError?.message}`);

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let extractedText = "";

    // 3. Extraction intelligente (PDF ou DOCX)
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(buffer);
      extractedText = data.text;
    } else if (filePath.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else {
      throw new Error("Format de fichier non supporté. Utilisez PDF ou DOCX.");
    }

    if (!extractedText.trim()) throw new Error("Le fichier semble vide après extraction.");

    // 4. Analyse via Groq (Llama 3.3 70B est excellent pour le français)
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
            content: "Tu es un expert RH. Analyse le texte du CV et retourne un JSON pur. Ne parle pas, ne commente pas." 
          },
          { 
            role: "user", 
            content: `Extrait les infos suivantes du texte en JSON : 
            {
              "prenom": "string",
              "nom": "string",
              "email": "string",
              "telephone": "string",
              "metier": "string",
              "annees_experience": number,
              "competences": ["string"],
              "profil": "string"
            }
            Texte du CV : ${extractedText.substring(0, 6000)}` // Limite pour éviter les dépassements de contexte
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
        const errorDetail = await groqResponse.text();
        throw new Error(`Erreur Groq: ${groqResponse.status} - ${errorDetail}`);
    }

    const groqData = await groqResponse.json();
    const candidate = JSON.parse(groqData.choices[0].message.content);

    // 5. Sauvegarde dans ta table "candidats"
    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    const { error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: candidate.nom,
        prenom: candidate.prenom,
        email: candidate.email,
        telephone: candidate.telephone,
        metiers: candidate.metier,
        competences: candidate.competences,
        annees_experience: candidate.annees_experience,
        profil: candidate.profil,
        cv_url: publicUrl,
        fichier: filePath,
        date_analyse: new Date().toISOString(),
        parse_status: 'completed'
      }, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, data: candidate });

  } catch (error: any) {
    console.error('ERREUR ANALYZE:', error.message);
    return res.status(500).json({ error: error.message });
  }
}