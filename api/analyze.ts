import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("--- ANALYSE CV DÉMARRÉE ---");
  console.log("Date:", new Date().toISOString());

  try {
    const { filePath } = req.body;
    console.log("Fichier:", filePath);

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Téléchargement du fichier
    console.log("Téléchargement...");
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);
    
    if (downloadError) throw downloadError;

    // 2. Extraction du texte
    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";
    
    if (filePath.toLowerCase().endsWith('.pdf')) {
      console.log("Extraction PDF...");
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(arrayBuffer),
        useSystemFonts: true,
      } as any);

      const pdf = await loadingTask.promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      rawText = fullText;
    } else {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    }

    // Nettoyage de base
    rawText = rawText.replace(/\s+/g, ' ').trim();
    console.log("Texte extrait, longueur:", rawText.length);

    // 3. Extraction des informations clés avec regex (avant l'IA)
    const extracted = extractBasicInfo(rawText);
    console.log("Infos extraites par regex:", extracted);

    // 4. IA Groq pour compléter et structurer
    console.log("Envoi à Groq pour enrichissement...");
    
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
            content: `Tu es un expert en extraction de CV. Extrais UNIQUEMENT les informations demandées au format JSON.

RÈGLES ABSOLUES :
- Le NOM est souvent en majuscules
- Le PRÉNOM est souvent après le nom ou avant
- L'EMAIL suit le format standard
- Le TÉLÉPHONE est au format français (06, 07, +33)
- Les MÉTIERS sont les titres principaux du CV (ex: "Administrateur Systèmes", "Ingénieur DevOps")

Format de sortie STRICT :
{
  "nom": "nom de famille",
  "prenom": "prénom",
  "email": "email",
  "telephone": "téléphone",
  "metiers": ["métier1", "métier2"]
}`
          },
          { 
            role: "user", 
            content: `Extrais du CV suivant UNIQUEMENT nom, prénom, email, téléphone, et métiers :

${rawText.substring(0, 2000)}` // On prend seulement le début du CV
          }
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const aiRes = await groqResponse.json();
    let aiData;
    
    try {
      aiData = JSON.parse(aiRes.choices[0].message.content);
      console.log("Données Groq:", aiData);
    } catch (e) {
      console.error("Erreur parsing Groq, utilisation des données regex");
      aiData = {};
    }

    // 5. Fusion des données (priorité à Groq, fallback sur regex)
    const candidatData = {
      nom: aiData.nom || extracted.nom || "Inconnu",
      prenom: aiData.prenom || extracted.prenom || "Inconnu",
      email: aiData.email || extracted.email || null,
      telephone: aiData.telephone || extracted.telephone || null,
      metiers: aiData.metiers || extracted.metiers || [],
      // On garde le texte brut pour traitement ultérieur
      raw_text: rawText,
      fichier: filePath,
      parse_status: 'completed',
      date_analyse: new Date().toISOString()
    };

    console.log("Données finales à sauvegarder:", {
      nom: candidatData.nom,
      prenom: candidatData.prenom,
      email: candidatData.email,
      telephone: candidatData.telephone,
      metiers: candidatData.metiers
    });

    // 6. Sauvegarde en base
    const { error: dbError } = await supabase
      .from('candidats')
      .upsert(candidatData, { 
        onConflict: 'fichier'
      });

    if (dbError) throw dbError;

    return res.status(200).json({ 
      success: true, 
      data: {
        nom: candidatData.nom,
        prenom: candidatData.prenom,
        email: candidatData.email,
        telephone: candidatData.telephone,
        metiers: candidatData.metiers
      }
    });

  } catch (error: any) {
    console.error("ERREUR:", error);
    return res.status(500).json({ error: error.message });
  }
}

// Fonction d'extraction par regex en secours
function extractBasicInfo(text: string) {
  const info: any = {
    nom: null,
    prenom: null,
    email: null,
    telephone: null,
    metiers: []
  };

  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) info.email = emailMatch[0];

  // Téléphone (format français)
  const phoneMatch = text.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
  if (phoneMatch) info.telephone = phoneMatch[0].replace(/\s+/g, '');

  // Extraction du nom/prénom depuis le début du CV
  const firstLines = text.split('\n').slice(0, 5).join(' ');
  
  // Pattern: "Prénom NOM" ou "NOM Prénom" avec majuscules
  const nameMatch = firstLines.match(/([A-Z][a-zéèêëàâîïôûùç]+)\s+([A-Z]{2,})|([A-Z]{2,})\s+([A-Z][a-zéèêëàâîïôûùç]+)/);
  if (nameMatch) {
    if (nameMatch[1] && nameMatch[2]) {
      info.prenom = nameMatch[1];
      info.nom = nameMatch[2];
    } else if (nameMatch[3] && nameMatch[4]) {
      info.nom = nameMatch[3];
      info.prenom = nameMatch[4];
    }
  }

  // Métiers courants
  const metiersList = [
    "Ingénieur", "Administrateur", "Développeur", "Chef de projet",
    "DevOps", "SysOps", "Support", "Technicien", "Responsable",
    "Architecte", "Consultant", "Manager", "Analyste"
  ];
  
  for (const metier of metiersList) {
    if (text.includes(metier) && !info.metiers.includes(metier)) {
      info.metiers.push(metier);
    }
  }

  return info;
}