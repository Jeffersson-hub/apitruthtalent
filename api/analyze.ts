import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// Utilisation du build legacy : c'est le seul qui contient tout le nécessaire
// pour Node.js sans forcer l'usage d'un worker externe.
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Gestion du CORS pour tes deux domaines
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { filePath } = req.body;
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Récupération du fichier sur Supabase Storage
    const { data: fileData } = await supabase.storage.from('truthtalent').download(filePath);
    if (!fileData) throw new Error("Fichier introuvable dans le storage");

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // 2. Extraction du texte selon le format
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
        disableWorker: true, // Crucial pour Vercel : évite de chercher un fichier worker.js
        verbosity: 0
      });
      
      const pdf = await loadingTask.promise;
      let textContent = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        // Le join(" ") permet d'éviter que les mots soient collés, facilitant la lecture du Nom/Prénom
        textContent += content.items.map((item: any) => item.str).join(" ") + "\n";
      }
      rawText = textContent;
    } else {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    // Sécurité : si l'extraction échoue, on ne va pas plus loin
    if (!rawText || rawText.length < 10) throw new Error("Échec de l'extraction du texte");

    // 3. Analyse avec Groq
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "Tu es un parseur RH. Extrais les données en JSON. Sois extrêmement attentif au Nom et Prénom qui sont au tout début du texte." },
          { role: "user", content: `JSON attendu: {nom, prenom, email, telephone, adresse, metiers, profil, competences[], experiences[], formations[], langues[], annees_experience}. Texte : ${rawText.substring(0, 6000)}` }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await groqResponse.json();
    const c = JSON.parse(aiData.choices[0].message.content);

    // 4. Upsert (Mise à jour ou Insertion) dans la table candidats
    const { error: dbError } = await supabase.from('candidats').upsert({
      nom: c.nom || "Non identifié",
      prenom: c.prenom || "Non identifié",
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

    return res.status(200).json({ success: true, candidate: `${c.prenom} ${c.nom}` });

  } catch (error: any) {
    console.error("Erreur Backend:", error.message);
    return res.status(500).json({ error: error.message });
  }
}