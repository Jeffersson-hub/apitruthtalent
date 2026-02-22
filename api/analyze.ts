import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';

// IMPORTATION STANDARD : On laisse Node décider du chemin
import * as pdfjs from 'pdfjs-dist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { filePath } = req.body;
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: fileData } = await supabase.storage.from('truthtalent').download(filePath);
    if (!fileData) throw new Error("Fichier vide");

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    if (filePath.toLowerCase().endsWith('.pdf')) {
      // Configuration sans worker externe pour éviter l'erreur de module sur Render/Vercel
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
        disableWorker: true,
        useSystemFonts: true
      });
      
      const pdf = await loadingTask.promise;
      let textContent = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // On ajoute des espaces pour que l'IA ne lise pas les mots collés
        textContent += content.items.map((item: any) => item.str).join(" ") + " ";
      }
      rawText = textContent;
    } else {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    // IA Groq avec focus sur l'identité
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un parseur RH. Trouve le NOM et le PRÉNOM. Réponds en JSON." },
          { role: "user", content: `Texte du CV : ${rawText.substring(0, 5000)}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiRes = await groqResponse.json();
    const c = JSON.parse(aiRes.choices[0].message.content);

    // Upsert
    const { error: dbError } = await supabase.from('candidats').upsert({
      nom: c.nom,
      prenom: c.prenom,
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
    console.error("ERREUR:", error.message);
    return res.status(500).json({ error: error.message });
  }
}