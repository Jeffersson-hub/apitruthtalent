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

    const arrayBuffer = await fileData.arrayBuffer();
    console.log("Taille du buffer reçu (octets):", arrayBuffer.byteLength);

    let rawText = "";

    // 2. Extraction
    if (filePath.toLowerCase().endsWith('.pdf')) {
      console.log("Démarrage extraction PDF.js...");
      try {
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(arrayBuffer),
          useSystemFonts: true,
          isEvalDisabled: true,
        } as any);

        const pdf = await loadingTask.promise;
        console.log("Nombre de pages détectées:", pdf.numPages);

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageLines = content.items.map((item: any) => item.str).join(" ");
          console.log(`Page ${i}: ${content.items.length} segments de texte trouvés.`);
          fullText += pageLines + "\n";
        }
        rawText = fullText;
      } catch (pdfErr: any) { // Correction du type unknown ici
        console.error("Erreur interne PDF.js:", pdfErr.message);
        throw new Error(`Échec PDF.js: ${pdfErr.message}`);
      }
    } else {
      console.log("Format Word détecté (Mammoth)");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

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
            content: `Tu es un expert en recrutement (ATS). Ta mission est d'extraire les données d'un CV avec une précision absolue.
            
            CONSIGNES CRUCIALES :
            1. IDENTITÉ : Le Nom et le Prénom sont TOUJOURS au début du texte. Ne les ignore jamais.
            2. STRUCTURE : Si tu vois "Jean-François BOISGONTIER", nom="BOISGONTIER", prenom="Jean-François".
            3. EXPÉRIENCES : Extrais chaque poste avec dates, entreprise et missions.
            4. FORMAT : Réponds uniquement en JSON pur.` 
          },
          { 
            role: "user", 
            content: `Extrais les infos de ce CV. 
            JSON attendu: {
              "nom": "", 
              "prenom": "", 
              "email": "", 
              "telephone": "", 
              "adresse": "", 
              "metiers": "", 
              "profil": "", 
              "competences": [], 
              "experiences": [{"date": "", "poste": "", "entreprise": "", "description": ""}], 
              "formations": [], 
              "langues": [], 
              "annees_experience": 0
            }
            
            Texte du CV : ${rawText.substring(0, 6000)}` 
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