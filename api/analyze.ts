import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // 2. Extraction améliorée du texte
    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";
    
    if (filePath.toLowerCase().endsWith('.pdf')) {
      console.log("Extraction PDF avec reconstruction structurelle avancée...");
      try {
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(arrayBuffer),
          useSystemFonts: true,
          isEvalDisabled: true,
        } as any);

        const pdf = await loadingTask.promise;
        let fullContent = "";
        let previousY = -1;
        let lineBuffer = [];
        let paragraphs = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          
          // Regrouper les textes par positions pour reconstruire les lignes
          const itemsByLine = new Map();
          
          for (const item of content.items as any[]) {
            const y = Math.round(item.transform[5] * 10) / 10; // Arrondi pour éviter les micro-variations
            if (!itemsByLine.has(y)) {
              itemsByLine.set(y, []);
            }
            itemsByLine.get(y).push({
              text: item.str,
              x: item.transform[4]
            });
          }

          // Trier les lignes par Y (de haut en bas)
          const sortedYs = Array.from(itemsByLine.keys()).sort((a, b) => b - a);
          
          for (const y of sortedYs) {
            const items = itemsByLine.get(y);
            // Trier les items par X (gauche à droite)
            items.sort((a, b) => a.x - b.x);
            
            const lineText = items.map(item => item.text).join(' ').trim();
            
            // Détection des sauts de paragraphe (grand écart vertical)
            if (previousY !== -1 && (previousY - y) > 15) {
              fullContent += '\n\n';
            } else if (previousY !== -1) {
              fullContent += '\n';
            }
            
            fullContent += lineText;
            previousY = y;
          }
          
          fullContent += '\n\n--- PAGE SUIVANTE ---\n\n';
        }
        
        rawText = fullContent;
        console.log("Structure PDF reconstruite avec succès");

      } catch (pdfErr: any) {
        console.error("Erreur PDF.js:", pdfErr.message);
        throw new Error(`Échec PDF: ${pdfErr.message}`);
      }
    } else {
      // Pour Word (Mammoth) avec options améliorées
      const result = await mammoth.extractRawText({ 
        buffer: Buffer.from(arrayBuffer),
        options: {
          preserveEmptyParagraphs: true
        }
      });
      rawText = result.value;
    }

    // Nettoyage et normalisation du texte
    rawText = rawText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    console.log("Longueur totale du texte extrait:", rawText.length);
    if (rawText.trim().length === 0) {
      console.error("ALERTE: Le texte extrait est totalement vide !");
    }

    // 3. IA Groq avec prompt ultra-détaillé
    console.log("Envoi à Groq avec instructions détaillées...");
    
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
            content: `Tu es un expert en extraction de données de CV. Tu dois analyser le texte fourni et retourner un JSON structuré avec TOUTES les informations disponibles, même partielles.

INSTRUCTIONS CRITIQUES :
- Le texte peut être mal formaté, cherche les informations avec intelligence
- Pour les tableaux et listes, extrais chaque élément individuellement
- Les emails sont souvent précédés de "Mail:" ou "Email:"
- Les téléphones sont souvent précédés de "Tél:" ou "Téléphone:"
- Les noms/prénoms sont souvent en MAJUSCULES ou en début de document

FORMAT DE SORTIE ATTENDU (JSON) :
{
  "nom": "Nom de famille",
  "prenom": "Prénom",
  "email": "email@example.com",
  "telephone": "numéro de téléphone",
  "adresse": "adresse complète",
  "metiers": ["métier1", "métier2"],
  "profil": "résumé du profil",
  "competences": ["compétence1", "compétence2"],
  "experiences": [
    {
      "poste": "titre du poste",
      "entreprise": "nom entreprise",
      "periode": "période",
      "description": "description détaillée"
    }
  ],
  "formations": [
    {
      "diplome": "nom du diplôme",
      "etablissement": "nom école/université",
      "annee": "année",
      "description": "détails"
    }
  ],
  "langues": ["langue1: niveau", "langue2: niveau"],
  "annees_experience": nombre_total_années
}`
          },
          { 
            role: "user", 
            content: `Analyse ce CV en profondeur et extrais TOUTES les informations disponibles au format JSON.

TEXTE DU CV :
"""
${rawText}
"""

INSTRUCTIONS SPÉCIFIQUES :
1. NOM/PRÉNOM : Cherche en début de document, souvent avant l'email
2. EMAIL : Cherche des patterns comme xxx@xxx.xx
3. TÉLÉPHONE : Patterns français (06, 07, +33)
4. EXPÉRIENCES : Pour chaque expérience, extrais poste, entreprise, période et description
5. FORMATIONS : Extrais tous les diplômes avec années et établissements
6. COMPÉTENCES : Sépare compétences techniques et soft skills
7. LANGUES : Niveau si spécifié

Retourne UNIQUEMENT le JSON, pas de texte explicatif.`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Erreur Groq API:", errorText);
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const aiRes = await groqResponse.json();
    console.log("Réponse Groq reçue, parsing du JSON...");
    
    let parsedData;
    try {
      parsedData = JSON.parse(aiRes.choices[0].message.content);
      console.log("Données parsées:", {
        nom: parsedData.nom,
        prenom: parsedData.prenom,
        nb_experiences: parsedData.experiences?.length || 0,
        nb_formations: parsedData.formations?.length || 0
      });
    } catch (parseError) {
      console.error("Erreur parsing JSON Groq:", parseError);
      console.log("Contenu brut:", aiRes.choices[0].message.content);
      throw new Error("Impossible de parser la réponse de l'IA");
    }

    // 4. Préparation des données pour Supabase
    const candidatData = {
      nom: parsedData.nom || "Inconnu",
      prenom: parsedData.prenom || "Inconnu",
      email: parsedData.email || null,
      telephone: parsedData.telephone || null,
      adresse: parsedData.adresse || null,
      metiers: Array.isArray(parsedData.metiers) ? parsedData.metiers : [],
      profil: parsedData.profil || null,
      competences: Array.isArray(parsedData.competences) ? parsedData.competences : [],
      experiences: Array.isArray(parsedData.experiences) ? parsedData.experiences : [],
      formations: Array.isArray(parsedData.formations) ? parsedData.formations : [],
      langues: Array.isArray(parsedData.langues) ? parsedData.langues : [],
      annees_experience: typeof parsedData.annees_experience === 'number' ? parsedData.annees_experience : 0,
      raw_text: rawText,
      fichier: filePath,
      parse_status: 'completed',
      date_analyse: new Date().toISOString(),
      confidence_score: parsedData.experiences?.length > 0 ? 0.8 : 0.3 // Score basé sur la qualité de l'extraction
    };

    // 5. Upsert Supabase
    console.log("Enregistrement en base pour:", candidatData.nom, candidatData.prenom);
    const { error: dbError } = await supabase
      .from('candidats')
      .upsert(candidatData, { 
        onConflict: 'fichier',
        ignoreDuplicates: false 
      });

    if (dbError) {
      console.error("Erreur base de données:", dbError);
      throw dbError;
    }

    console.log("--- ANALYSE TERMINÉE AVEC SUCCÈS ---");
    return res.status(200).json({ 
      success: true, 
      parsed: `${candidatData.prenom} ${candidatData.nom}`,
      stats: {
        experiences: candidatData.experiences.length,
        formations: candidatData.formations.length,
        competences: candidatData.competences.length
      }
    });

  } catch (error: any) {
    console.error("CRASH ANALYSE:", error);
    
    // Tentative de sauvegarde de l'erreur en base
    try {
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await supabase
        .from('candidats')
        .upsert({
          fichier: req.body.filePath,
          parse_status: 'failed',
          last_error: error.message,
          date_analyse: new Date().toISOString()
        }, { onConflict: 'fichier' });
    } catch (logError) {
      console.error("Impossible de logger l'erreur en base:", logError);
    }

    return res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}