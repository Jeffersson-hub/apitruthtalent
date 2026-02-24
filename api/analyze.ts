import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Configuration du worker PDF.js pour éviter les erreurs en environnement Serverless
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("--- DÉBUT ANALYSE TRUTHTALENT ---");

  try {
    const { filePath } = req.body;
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Téléchargement
    const { data: fileData, error: downloadError } = await supabase.storage.from('truthtalent').download(filePath);
    if (downloadError) throw downloadError;

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // 2. Extraction du texte (Améliorée)
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdf = await loadingTask.promise;
      let fullContent = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        // Tri par position Y (haut vers bas) puis X (gauche vers droite) 
        // pour mieux gérer les colonnes
        const items = content.items as any[];
        items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);

        let lastY = -1;
        let pageText = "";
        for (const item of items) {
          if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 8) {
            pageText += "\n";
          }
          pageText += item.str + " ";
          lastY = item.transform[5];
        }
        fullContent.push(pageText);
      }
      rawText = fullContent.join("\n--- PAGE SEPARATOR ---\n");
    } else {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    if (!rawText.trim()) throw new Error("Le texte extrait est vide.");

    // 3. IA Groq avec Schéma JSON strict
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
            content: `Tu es un expert en recrutement. Analyse le CV fourni et retourne EXCLUSIVEMENT un objet JSON respectant cette structure exacte :
            {
              "nom": "string",
              "prenom": "string",
              "email": "string",
              "telephone": "string",
              "adresse": "string",
              "metiers": "string (le titre du poste actuel ou visé)",
              "profil": "string (résumé court)",
              "competences": ["array de strings"],
              "experiences": [{"poste": "string", "entreprise": "string", "duree": "string", "description": "string"}],
              "formations": [{"diplome": "string", "ecole": "string", "annee": "string"}],
              "langues": ["array de strings"],
              "annees_experience": number
            }
            Si une information est absente, mets null. Ne divague pas.`
          },
          { role: "user", content: `Voici le texte du CV :\n${rawText}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1 // Plus bas pour plus de précision technique
      })
    });

    const aiRes = await groqResponse.json();
    const candidateData = JSON.parse(aiRes.choices[0].message.content);

    // 4. Upsert Supabase (Nettoyage des données avant envoi)
    const { error: dbError } = await supabase.from('candidats').upsert({
      nom: candidateData.nom || "Inconnu",
      prenom: candidateData.prenom || "Inconnu",
      email: candidateData.email,
      telephone: candidateData.telephone,
      adresse: candidateData.adresse,
      metiers: candidateData.metiers,
      profil: candidateData.profil,
      competences: candidateData.competences || [],
      experiences: candidateData.experiences || [],
      formations: candidateData.formations || [],
      langues: candidateData.langues || [],
      annees_experience: Number(candidateData.annees_experience) || 0,
      raw_text: rawText,
      fichier: filePath,
      parse_status: 'completed',
      date_analyse: new Date().toISOString()
    }, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, name: `${candidateData.prenom} ${candidateData.nom}` });

  } catch (error: any) {
    console.error("ERREUR CRASH:", error.message);
    return res.status(500).json({ error: error.message });
  }
}