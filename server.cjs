// server.cjs - Version CommonJS pour Render
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const app = express();

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ============================================
// FONCTIONS D'EXTRACTION
// ============================================
async function extractTextFromPDF(arrayBuffer) {
  try {
    const buffer = Buffer.from(arrayBuffer);
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error("❌ Erreur extraction PDF:", error);
    throw error;
  }
}

async function extractTextFromDOCX(arrayBuffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
    return result.value;
  } catch (error) {
    console.error("❌ Erreur extraction DOCX:", error);
    throw error;
  }
}

function parseFrenchMonth(monthStr) {
  const months = {
    'janvier': 0, 'février': 1, 'fevrier': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
    'juillet': 6, 'août': 7, 'aout': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11, 'decembre': 11
  };
  return months[monthStr.toLowerCase()] ?? 0;
}

function extractDates(periode) {
  const result = { start: null, end: null };
  if (!periode) return result;

  const parts = periode.split(/[-–—/]| au /).map(p => p.trim());
  
  const parsePart = (part) => {
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

function calculateTotalYears(experiences) {
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

function getNiveauExperience(annees) {
    if (annees <= 2) return 'Junior';
    if (annees <= 5) return 'Confirmé';
    if (annees <= 10) return 'Senior';
    return 'Expert';
}

// ============================================
// ROUTE D'ANALYSE
// ============================================
app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "filePath requis" });
    }

    console.log("📁 Fichier à analyser:", filePath);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Télécharger le fichier
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      console.error("❌ Erreur téléchargement:", downloadError);
      throw downloadError;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // Extraire le texte
    if (filePath.toLowerCase().endsWith('.pdf')) {
      rawText = await extractTextFromPDF(arrayBuffer);
    } else if (filePath.toLowerCase().endsWith('.docx')) {
      rawText = await extractTextFromDOCX(arrayBuffer);
    } else {
      throw new Error("Format non supporté. Utilisez PDF ou DOCX.");
    }

    if (!rawText.trim()) {
      throw new Error("Extraction impossible : texte vide.");
    }

    console.log("📝 Texte extrait (premiers caractères):", rawText.substring(0, 300));

    // Extraction des contacts
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
    const emailSecu = emailMatch ? emailMatch[0].toLowerCase() : null;
    const telSecu = phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : null;

    // Appel Groq
    const groqApiKey = process.env.GROQ_API_KEY;
    let parsed = null;

    if (groqApiKey) {
      try {
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
                content: `Tu es un expert RH. Analyse le CV et extrais en JSON UNIQUEMENT :
                  - nom, prenom
                  - niveau (CAP, Bac, BTS, DEUG, Licence, Master, Doctorat)
                  - metiers (array)
                  - competences (array)
                  - experiences (array d'objets { poste, entreprise, periode, description })
                  Réponds UNIQUEMENT en JSON valide.` 
              },
              { role: "user", content: rawText }
            ],
            response_format: { type: "json_object" },
            temperature: 0
          })
        });

        if (groqResponse.ok) {
          const aiRes = await groqResponse.json();
          parsed = JSON.parse(aiRes.choices[0].message.content);
          console.log("✅ Groq a répondu");
        }
      } catch (groqError) {
        console.warn("⚠️ Erreur Groq:", groqError.message);
      }
    }

    // Fallback si Groq échoue
    if (!parsed) {
      parsed = {
        nom: "Inconnu",
        prenom: "Inconnu",
        niveau: null,
        metiers: [],
        competences: [],
        experiences: []
      };
    }

    // Calcul de l'expérience
    const experiencesArray = Array.isArray(parsed.experiences) ? parsed.experiences : [];
    const experienceCalculee = calculateTotalYears(experiencesArray);
    const niveauExperience = getNiveauExperience(experienceCalculee);

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
      fichier: filePath,
      raw_text: rawText
    };

    console.log("✅ Analyse terminée pour:", finalData.email || finalData.nom);

    return res.status(200).json({ 
      success: true, 
      data: finalData
    });

  } catch (error) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Erreur interne" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Render en écoute sur le port ${PORT}`);
});