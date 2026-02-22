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

    const { data: fileData } = await supabase.storage.from('truthtalent').download(filePath);
    if (!fileData) throw new Error("Fichier non trouvé");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let text = "";
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const data = await pdf(buffer);
      text = data.text;
    } else {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }

    // PROMPT ULTRA-STRICT pour matcher ton CSV
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un extracteur de données. Tu dois répondre par un JSON plat sans imbrication." },
          { role: "user", content: `Analyse ce CV et remplis EXACTEMENT ces clés JSON. Si une info manque, laisse vide.
            {
              "nom": "NOM_EN_MAJUSCULE",
              "prenom": "Prenom",
              "email": "email@test.com",
              "telephone": "0600000000",
              "metiers": "Titre du poste",
              "competences": ["comp1", "comp2"],
              "profil": "Bref résumé",
              "annees_experience": 5
            }
            Texte du CV : ${text.substring(0, 5000)}` 
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const groqData = await groqResponse.json();
    const candidate = JSON.parse(groqData.choices[0].message.content);

    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    // INSERTION AVEC LES BONS CHAMPS
    const { error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: candidate.nom || null,
        prenom: candidate.prenom || null,
        email: candidate.email || null,
        telephone: candidate.telephone || null,
        metiers: candidate.metiers || null,
        competences: candidate.competences || [],
        profil: candidate.profil || null,
        annees_experience: parseFloat(candidate.annees_experience) || 0,
        fichier: filePath,
        cv_url: publicUrl,
        parse_status: 'completed',
        date_analyse: new Date().toISOString()
      }, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, data: candidate });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}