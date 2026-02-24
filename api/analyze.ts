import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Configuration du worker PDF.js pour les environnements serverless
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("--- DÉBUT ANALYSE TRUTHTALENT (FOCUS TOP 5) ---");

  try {
    const { filePath } = req.body;
    if (!filePath) throw new Error("Le chemin du fichier (filePath) est manquant.");

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Téléchargement du fichier depuis Supabase
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) throw downloadError;

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // 2. Extraction du texte selon le format
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const loadingTask = pdfjs.getDocument({ 
        data: new Uint8Array(arrayBuffer),
        useSystemFonts: true 
      });
      const pdf = await loadingTask.promise;
      let fullContent = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        
        // TRI SPATIAL : Crucial pour les CV à 2 colonnes (ex: Emily Pillot)
        const items = content.items as any[];
        items.sort((a, b) => {
          if (Math.abs(b.transform[5] - a.transform[5]) > 5) {
            return b.transform[5] - a.transform[5]; // Haut vers bas
          }
          return a.transform[4] - b.transform[4]; // Gauche vers droite
        });

        let lastY = -1;
        let pageText = "";
        for (const item of items) {
          if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 5) {
            pageText += "\n";
          }
          pageText += item.str + " ";
          lastY = item.transform[5];
        }
        fullContent.push(pageText);
      }
      rawText = fullContent.join("\n--- PAGE ---\n");
    } else {
      // Pour les fichiers Word (.docx)
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    if (!rawText.trim()) throw new Error("Extraction impossible : texte vide.");

    // 3. SÉCURITÉS REGEX (Extraction mathématique de l'email et du téléphone)
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);

    const emailSecu = emailMatch ? emailMatch[0].toLowerCase() : null;
    const telSecu = phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : null;

    // 4. APPEL À GROQ (Modèle Llama 3.3 70B)
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
            content: `Tu es un expert RH. Analyse le CV et extrais UNIQUEMENT ces 5 champs en JSON :
            - nom (en MAJUSCULES)
            - prenom (Format Standard)
            - email (l'adresse email trouvée)
            - telephone (format 10 chiffres)
            - metiers (le titre principal du profil ou poste actuel)
            
            Si une info est manquante, mets null. Réponds uniquement par le JSON.`
          },
          { role: "user", content: `Texte extrait du CV :\n${rawText}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0 // Zéro créativité, 100% précision
      })
    });

    const aiRes = await groqResponse.json();
    if (!aiRes.choices) throw new Error("Erreur de réponse Groq");
    
    const parsed = JSON.parse(aiRes.choices[0].message.content);

    // 5. FUSION DES DONNÉES (Priorité à la sécurité Regex)
    const finalData = {
      nom: parsed.nom || "Inconnu",
      prenom: parsed.prenom || "Inconnu",
      email: emailSecu || parsed.email,
      telephone: telSecu || parsed.telephone,
      metiers: parsed.metiers || "Non spécifié",
      raw_text: rawText,
      fichier: filePath,
      parse_status: 'completed',
      date_analyse: new Date().toISOString()
    };

    console.log("Données finales prêtes pour insertion :", { 
      nom: finalData.nom, 
      prenom: finalData.prenom, 
      email: finalData.email 
    });

    // 6. ENREGISTREMENT DANS SUPABASE
    const { error: dbError } = await supabase
      .from('candidats')
      .upsert(finalData, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    return res.status(200).json({ 
      success: true, 
      message: `Analyse de ${finalData.prenom} ${finalData.nom} terminée.` 
    });

  } catch (error: any) {
    console.error("CRASH ANALYSE:", error.message);
    return res.status(500).json({ error: error.message });
  }
}