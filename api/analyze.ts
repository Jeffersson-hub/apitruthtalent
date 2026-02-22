import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { filePath } = req.body;
    console.log("Analyse du fichier:", filePath);

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Téléchargement
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !fileData) throw new Error("Fichier introuvable dans le storage");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let text = "";

    // 2. Extraction
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }

    // 3. IA - On force Groq à utiliser TES noms de colonnes
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un expert RH. Réponds par un objet JSON uniquement." },
          { role: "user", content: `Analyse ce CV et remplis ce JSON exactement : 
            {
              "nom": "", "prenom": "", "email": "", "telephone": "",
              "metiers": "", "competences": [], "annees_experience": 0, "profil": ""
            }
            Texte : ${text.substring(0, 4000)}` 
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const groqData = await groqResponse.json();
    const candidate = JSON.parse(groqData.choices[0].message.content);

    // 4. L'insertion avec log d'erreur précis
    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    const { data: dbData, error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: candidate.nom,
        prenom: candidate.prenom,
        email: candidate.email,
        telephone: candidate.telephone,
        metiers: candidate.metiers, // Pluriel comme dans ton CSV
        competences: candidate.competences,
        annees_experience: candidate.annees_experience || 0,
        profil: candidate.profil,
        cv_url: publicUrl,
        fichier: filePath, // VERIFIE QUE CETTE COLONNE EST "UNIQUE" DANS SUPABASE
        parse_status: 'completed',
        date_analyse: new Date().toISOString()
      }, { 
        onConflict: 'fichier' 
      })
      .select(); // On demande le retour pour être sûr

    if (dbError) {
      console.error("Erreur Supabase détaillée:", dbError);
      throw new Error(`Supabase Upsert Error: ${dbError.message}`);
    }

    return res.status(200).json({ success: true, inserted: dbData });

  } catch (error: any) {
    console.error("Erreur API:", error.message);
    return res.status(500).json({ error: error.message });
  }
}