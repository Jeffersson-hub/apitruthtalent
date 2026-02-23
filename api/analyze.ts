import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Logs de début
  console.log("--- NOUVELLE ANALYSE LANCÉE ---");
  console.log("Date:", new Date().toISOString());

  try {
    const { filePath } = req.body;
    console.log("Fichier cible:", filePath);

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Download
    console.log("Téléchargement depuis Supabase...");
    const { data: fileData, error: downloadError } = await supabase.storage.from('truthtalent').download(filePath);
    
    if (downloadError) {
      console.error("Erreur téléchargement Supabase:", downloadError);
      throw downloadError;
    }

    // ... après le téléchargement du fichier ...
    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = ""; // C'est cette variable qu'on utilise pour Groq
    
    if (filePath.toLowerCase().endsWith('.pdf')) {
      console.log("Démarrage extraction PDF.js avec reconstruction de lignes...");
      try {
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(arrayBuffer),
          useSystemFonts: true,
          isEvalDisabled: true,
        } as any);

        const pdf = await loadingTask.promise;
        let fullContent = ""; // On utilise une variable locale au bloc PDF

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          
          let lastY = -1;
          let pageText = "";
          
          for (const item of content.items as any[]) {
            // RECONSTRUCTION DE LA STRUCTURE VISUELLE
            // Si la position Y change de plus de 5 unités, on considère que c'est une nouvelle ligne
            if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 5) {
              pageText += "\n";
            }
            pageText += item.str + " ";
            lastY = item.transform[5];
          }
          
          fullContent += pageText + "\n";
        }
        rawText = fullContent; // On assigne à la variable globale au handler
      } catch (pdfErr: any) {
        console.error("Erreur PDF.js:", pdfErr.message);
        throw new Error(`Échec PDF: ${pdfErr.message}`);
      }
    } else {
      // Pour Word (Mammoth)
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    // Ici, rawText est désormais accessible et structuré avec des retours à la ligne !
    console.log("Texte prêt pour Groq (longueur):", rawText.length);

    console.log("Longueur totale du texte extrait:", rawText.length);
    if (rawText.trim().length === 0) {
      console.error("ALERTE: Le texte extrait est totalement vide !");
    }

    // 3. IA Groq
    console.log("Envoi à Groq...");
    // 3. IA Groq avec Prompt renforcé
    console.log("Envoi à Groq avec instructions renforcées...");
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
            content: `Tu es un expert en parsing de CV. Tu dois extraire les informations même si le texte est mal formaté.
            
            RÈGLES D'OR :
            - NOM/PRÉNOM : Ils sont souvent sur la toute première ligne ou près de l'email.
            - TÉLÉPHONE : Cherche des suites de 10 chiffres ou avec +33.
            - FORMATIONS : Liste tout le cursus scolaire.
            - COMPÉTENCES : Extrais les mots-clés techniques et soft skills.` 
          },
          { 
            role: "user", 
            content: `Analyse ce CV et retourne un JSON structuré.
            Texte : ### ${rawText} ###` 
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiRes = await groqResponse.json();
    console.log("Réponse Groq reçue.");
    const c = JSON.parse(aiRes.choices[0].message.content);

    // 4. Upsert Supabase
    console.log("Enregistrement en base pour:", c.nom, c.prenom);
    const { error: dbError } = await supabase.from('candidats').upsert({
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
      raw_text: rawText, // ON SAUVEGARDE LE TEXTE BRUT POUR VÉRIFIER
      fichier: filePath,
      parse_status: 'completed',
      date_analyse: new Date().toISOString()
    }, { onConflict: 'fichier' });

    if (dbError) throw dbError;

    console.log("--- ANALYSE TERMINÉE AVEC SUCCÈS ---");
    return res.status(200).json({ success: true, parsed: `${c.prenom} ${c.nom}` });

  } catch (error: any) {
    console.error("CRASH ANALYSE:", error.message);
    return res.status(500).json({ error: error.message });
  }
}