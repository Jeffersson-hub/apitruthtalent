import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Fonction robuste pour extraire le texte d'un PDF
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += `--- PAGE ${i} ---\n${pageText}\n`;
  }
  return fullText;
}

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
    let rawText = "";

    // 2. Extraction selon le format
    if (filePath.toLowerCase().endsWith('.pdf')) {
      rawText = await extractTextFromPDF(buffer);
    } else {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    }

    if (!rawText || rawText.length < 20) throw new Error("Extraction vide ou texte illisible");

    // 3. Appel Groq (On demande un mapping strict)
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un parseur de CV expert. Réponds uniquement en JSON." },
          { role: "user", content: `Extrait les infos suivantes du CV : 
            nom, prenom, email, telephone, adresse, metiers, profil, annees_experience (nombre), 
            competences (liste), experiences (liste), formations (liste), langues (liste).
            Texte : ${rawText.substring(0, 6000)}` 
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const groqData = await groqResponse.json();
    const c = JSON.parse(groqData.choices[0].message.content);

    // 4. Upsert Supabase (Mapping précis avec ta table)
    const { error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: c.nom,
        prenom: c.prenom,
        email: c.email,
        telephone: c.telephone,
        adresse: c.adresse,
        metiers: c.metiers,
        profil: c.profil,
        annees_experience: parseFloat(c.annees_experience) || 0,
        competences: c.competences || [],
        experiences: c.experiences || [],
        formations: c.formations || [],
        langues: c.langues || [],
        fichier: filePath,
        raw_text: rawText.substring(0, 2000),
        parse_status: 'completed',
        date_analyse: new Date().toISOString()
      }, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, data: c });

  } catch (error: any) {
    console.error("Erreur API:", error.message);
    return res.status(500).json({ error: error.message });
  }
}