// api/analyze.ts - Vérifiez que le worker est configuré
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';

// Configuration du worker PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Utiliser le worker local pour Vercel
const workerPath = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.js', import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

// ============================================
// HEADERS CORS
// ============================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400'
};

// ============================================
// FONCTIONS
// ============================================
function parseFrenchMonth(monthStr: string): number {
  const months: { [key: string]: number } = {
    'janvier': 0, 'février': 1, 'fevrier': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
    'juillet': 6, 'août': 7, 'aout': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11, 'decembre': 11
  };
  return months[monthStr.toLowerCase()] ?? 0;
}

function extractDates(periode: string) {
  const result = { start: null as Date | null, end: null as Date | null };
  if (!periode) return result;

  const parts = periode.split(/[-–—/]| au /).map(p => p.trim());
  
  const parsePart = (part: string) => {
    const monthYear = part.match(/([a-zA-Zûé]+)\s+(\d{4})/i);
    const yearOnly = part.match(/(\d{4})/);
    if (monthYear) return new Date(parseInt(monthYear[2]), parseFrenchMonth(monthYear[1]), 1);
    if (yearOnly) return new Date(parseInt(yearOnly[1]), 0, 1);
    return null;
  };

  result.start = parsePart(parts[0]);
  if (parts.length >= 2) {
    const isCurrent = /présent|actuel|aujourd|maintenant/i.test(parts[1]);
    result.end = isCurrent ? new Date() : parsePart(parts[1]);
    if (result.end && !parts[1].match(/[a-zA-Zûé]+/)) result.end.setMonth(11, 31);
  } else if (result.start) {
    result.end = new Date(result.start.getFullYear(), 11, 31);
  }
  return result;
}

function calculateTotalYears(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;
  let totalMonths = 0;
  experiences.forEach(exp => {
    const { start, end } = extractDates(exp.periode || "");
    if (start && end && end >= start) {
      const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
      totalMonths += diff;
    }
  });
  return Math.min(99.9, Math.max(0, Math.round((totalMonths / 12) * 10) / 10));
}

function getNiveauExperience(annees: number): string {
    if (annees <= 2) return 'Junior';
    if (annees <= 5) return 'Confirmé';
    if (annees <= 10) return 'Senior';
    return 'Expert';
}

// ============================================
// FONCTION PRINCIPALE D'EXTRACTION DE TEXTE
// ============================================
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullContent: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const items = textContent.items as any[];
      // Tri spatial pour les CV à 2 colonnes
      items.sort((a, b) => {
        if (Math.abs(b.transform[5] - a.transform[5]) > 5) {
          return b.transform[5] - a.transform[5];
        }
        return a.transform[4] - b.transform[4];
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
    return fullContent.join("\n--- PAGE ---\n");
  } catch (error) {
    console.error("❌ Erreur extraction PDF:", error);
    throw error;
  }
}

// ============================================
// FONCTION PRINCIPALE
// ============================================
export default async function handler(req: any, res: any) {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    const { filePath } = req.body;
    if (!filePath) {
      throw new Error("Le chemin du fichier (filePath) est manquant.");
    }

    console.log("📁 Fichier à analyser:", filePath);

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Téléchargement du fichier
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      console.error("❌ Erreur téléchargement:", downloadError);
      throw downloadError;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // 2. Extraction du texte
    if (filePath.toLowerCase().endsWith('.pdf')) {
      rawText = await extractTextFromPDF(arrayBuffer);
    } else if (filePath.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      rawText = result.value;
    } else {
      throw new Error("Format non supporté. Utilisez PDF ou DOCX.");
    }

    if (!rawText.trim()) {
      throw new Error("Extraction impossible : texte vide.");
    }

    console.log("📝 Texte extrait (premiers caractères):", rawText.substring(0, 200));

    // 3. Extraction des contacts
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
    const emailSecu = emailMatch ? emailMatch[0].toLowerCase() : null;
    const telSecu = phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : null;

    // 4. Appel Groq
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      throw new Error("GROQ_API_KEY non définie");
    }

    console.log("🤖 Appel Groq...");

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${groqApiKey}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { 
            role: "system", 
            content: `Tu es un expert RH. Analyse le CV et extrais en JSON :
              - nom, prenom, email, telephone
              - niveau : Choisis strictement parmi [CAP, Bac, BTS, DEUG, Licence, Master, Doctorat].
              - metiers : Liste des titres de postes principaux (ex: ["Développeur Fullstack", "Chef de Projet"]). 
              - competences : Liste de mots-clés techniques.
              - experiences : Liste d'objets { poste, entreprise, periode, description }.
              Réponds UNIQUEMENT en JSON valide.` 
          },
          { role: "user", content: rawText }
        ],
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("❌ Erreur Groq:", errorText);
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const aiRes = await groqResponse.json();
    console.log("✅ Réponse Groq reçue");

    let parsed;
    try {
      parsed = JSON.parse(aiRes.choices[0].message.content);
    } catch (e) {
      console.error("❌ Erreur parsing JSON Groq:", aiRes.choices[0].message.content);
      throw new Error("La réponse de Groq n'est pas un JSON valide");
    }

    // 5. Calcul de l'expérience
    const experiencesArray = Array.isArray(parsed.experiences) ? parsed.experiences : [];
    const experienceCalculee = calculateTotalYears(experiencesArray);
    const niveauExperience = getNiveauExperience(experienceCalculee);

    // 6. Structure de réponse
    const finalData = {
      nom: parsed.nom || "Inconnu",
      prenom: parsed.prenom || "Inconnu",
      email: emailSecu || parsed.email || null,
      telephone: telSecu || parsed.telephone || null,
      niveau: parsed.niveau || null,
      metiers: parsed.metiers || [],
      competences: parsed.competences || [],
      experiences: experiencesArray,
      annees_experience: experienceCalculee,
      niveau_experience: niveauExperience,
      fichier: filePath
    };

    console.log("✅ Analyse terminée pour:", finalData.email || finalData.nom);

    return res.status(200).json({ 
      success: true, 
      data: finalData
    });

  } catch (error: any) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Erreur interne" 
    });
  }
}