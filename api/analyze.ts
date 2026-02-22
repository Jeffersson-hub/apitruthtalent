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
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Extraction du texte
    const { data: fileData } = await supabase.storage.from('truthtalent').download(filePath);
    if (!fileData) throw new Error("Fichier introuvable");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let rawText = "";
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(buffer);
      rawText = data.text;
    } else {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    }

    // 2. Appel Groq avec instructions de formatage strictes
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
            content: "Tu es un parseur de CV ultra-précis. Tu extrais les données pour une base PostgreSQL. Réponds uniquement en JSON." 
          },
          { 
            role: "user", 
            content: `Analyse ce texte et remplis ce JSON exactement. 
            IMPORTANT: 'competences', 'experiences', 'formations', 'langues' doivent être des TABLEAUX de chaînes.
            {
              "nom": "NOM",
              "prenom": "Prenom",
              "email": "email",
              "telephone": "telephone",
              "adresse": "ville",
              "metiers": "le poste actuel ou visé",
              "profil": "résumé court",
              "annees_experience": 5,
              "competences": ["A", "B"],
              "experiences": ["Job 1", "Job 2"],
              "formations": ["Diplome 1"],
              "langues": ["Français"]
            }
            Texte : ${rawText.substring(0, 5000)}` 
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const groqData = await groqResponse.json();
    const c = JSON.parse(groqData.choices[0].message.content);

    // 3. Insertion SQL - Mapping exact avec ta table candidats
    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    const { error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: c.nom || null,
        prenom: c.prenom || null,
        email: c.email || null,
        telephone: c.telephone || null,
        adresse: c.adresse || null,
        metiers: c.metiers || null,
        profil: c.profil || null,
        annees_experience: parseFloat(c.annees_experience) || 0,
        // Champs JSONB (on envoie des tableaux JS directs, Supabase gère le cast)
        competences: c.competences || [],
        experiences: c.experiences || [],
        formations: c.formations || [],
        langues: c.langues || [],
        // Métadonnées
        fichier: filePath,
        cv_url: publicUrl,
        raw_text: rawText.substring(0, 2000),
        parse_status: 'completed',
        date_analyse: new Date().toISOString()
      }, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, message: "Candidat inséré avec succès" });

  } catch (error: any) {
    console.error("Erreur API:", error.message);
    return res.status(500).json({ error: error.message });
  }
}