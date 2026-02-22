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

    // 1. Téléchargement
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

    // 2. IA Groq avec le schéma EXACT de ta table SQL
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
            content: "Tu es un extracteur de données RH. Réponds par un JSON plat respectant strictement les types demandés." 
          },
          { 
            role: "user", 
            content: `Analyse ce CV et retourne ce JSON (si vide, utilise null ou [] pour les listes) :
            {
              "nom": "NOM",
              "prenom": "Prenom",
              "email": "email",
              "telephone": "téléphone",
              "metiers": "titre du poste",
              "adresse": "ville ou adresse",
              "competences": ["comp1", "comp2"],
              "formations": ["diplome 1", "diplome 2"],
              "langues": ["langue 1", "langue 2"],
              "experiences": ["exp 1", "exp 2"],
              "profil": "résumé court",
              "annees_experience": 5.5
            }
            Texte du CV : ${text.substring(0, 6000)}` 
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const groqData = await groqResponse.json();
    const candidate = JSON.parse(groqData.choices[0].message.content);

    // 3. Préparation de l'URL publique
    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    // 4. Insertion dans la table public.candidats
    const { error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: candidate.nom,
        prenom: candidate.prenom,
        email: candidate.email,
        telephone: candidate.telephone,
        adresse: candidate.adresse,
        metiers: candidate.metiers,
        profil: candidate.profil,
        // Conversion propre pour les champs JSONB
        competences: JSON.stringify(candidate.competences || []),
        formations: JSON.stringify(candidate.formations || []),
        langues: JSON.stringify(candidate.langues || []),
        experiences: JSON.stringify(candidate.experiences || []),
        // Conversion numérique
        annees_experience: parseFloat(candidate.annees_experience) || 0,
        // Champs techniques
        fichier: filePath,
        cv_url: publicUrl,
        cv_filename: filePath.split('/').pop(),
        parse_status: 'completed',
        date_analyse: new Date().toISOString(),
        raw_text: text.substring(0, 1000) // On garde un extrait pour recherche
      }, { 
        onConflict: 'fichier' 
      });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, data: candidate });

  } catch (error: any) {
    console.error("Erreur:", error.message);
    return res.status(500).json({ error: error.message });
  }
}