import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mammoth = require('mammoth');

// Nouvelle méthode d'importation robuste pour Vercel
import * as pdfjs from 'pdfjs-dist';

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Configuration CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { filePath } = req.body;
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Download
    const { data: fileData } = await supabase.storage.from('truthtalent').download(filePath);
    if (!fileData) throw new Error("Fichier vide ou introuvable");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let rawText = "";

    // 2. Extraction du texte (Version pdfjs 4.4+)
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const data = new Uint8Array(buffer);
      const loadingTask = pdfjs.getDocument({ 
        data, 
        disableFontFace: true,
        useSystemFonts: true 
      });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // On récupère TOUT le texte, y compris les en-têtes (Nom/Prénom)
        fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
      }
      rawText = fullText;
    } else {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    }

    // 3. IA Groq (Prompt ultra-insistant sur le nom)
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un parseur. Trouve impérativement le NOM et le PRÉNOM. Ils sont au début." },
          { role: "user", content: `JSON : {nom, prenom, email, telephone, adresse, metiers, profil, competences[], experiences[], formations[], langues[], annees_experience}. Texte : ${rawText.substring(0, 5000)}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const resultIA = await groqResponse.json();
    const c = JSON.parse(resultIA.choices[0].message.content);

    // 4. Upsert Supabase (Mapping final)
    const { error: dbError } = await supabase.from('candidats').upsert({
      nom: c.nom || "NON_TROUVE",
      prenom: c.prenom || "NON_TROUVE",
      email: c.email,
      telephone: c.telephone,
      adresse: c.adresse,
      metiers: c.metiers,
      profil: c.profil,
      competences: c.competences || [],
      experiences: c.experiences || [],
      formations: c.formations || [],
      langues: c.langues || [],
      annees_experience: parseFloat(c.annees_experience) || 0,
      fichier: filePath,
      parse_status: 'completed',
      date_analyse: new Date().toISOString()
    }, { onConflict: 'fichier' });

    if (dbError) throw dbError;
    return res.status(200).json({ success: true, debug: `${c.prenom} ${c.nom}` });

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}