import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
// Import direct du fichier compatible Node/Vercel
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';

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

    const buffer = await fileData.arrayBuffer();
    let rawText = "";

    if (filePath.toLowerCase().endsWith('.pdf')) {
      // Configuration spécifique pour éviter le besoin de "canvas" sur le serveur
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        disableFontFace: true,
        useSystemFonts: true,
        isEvalDisabled: true
      });
      
      const pdf = await loadingTask.promise;
      let textContent = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textContent += content.items.map((item: any) => item.str).join(" ") + "\n";
      }
      rawText = textContent;
    } else {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      rawText = result.value;
    }

    // IA Groq
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un parseur RH. Réponds en JSON. Sois attentif au Nom et Prénom en début de texte." },
          { role: "user", content: `JSON: {nom, prenom, email, telephone, adresse, metiers, profil, competences[], experiences[], formations[], langues[], annees_experience}. Texte: ${rawText.substring(0, 5000)}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiRes = await groqResponse.json();
    const c = JSON.parse(aiRes.choices[0].message.content);

    // Upsert
    await supabase.from('candidats').upsert({
      nom: c.nom || "Inconnu",
      prenom: c.prenom || "Inconnu",
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
      parse_status: 'completed'
    }, { onConflict: 'fichier' });

    return res.status(200).json({ success: true, name: `${c.prenom} ${c.nom}` });

  } catch (error: any) {
    console.error("Erreur détaillée:", error.message);
    return res.status(500).json({ error: error.message });
  }
}