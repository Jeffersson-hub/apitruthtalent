import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';

const { WordTokenizer } = natural;

const app = express();
app.use(express.json({ limit: '50mb' }));

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement Supabase manquantes");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

// Fonction pour extraire le texte d'un fichier
async function extractTextFromFile(fileBuffer, fileType) {
  try {
    if (fileType === 'pdf') {
      const data = await pdfParse(Buffer.from(fileBuffer));
      return data.text;
    } else if (fileType === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      return value;
    } else {
      throw new Error("Format de fichier non supporté");
    }
  } catch (error) {
    throw new Error(`Erreur d'extraction: ${error.message}`);
  }
}

// Fonction pour extraire le nom et prénom
function extractName(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const namePatterns = [
    /([A-Z][a-zéèêëàâîïôöûüç\s-]+)\s+([A-Z][a-zéèêëàâîïôöûüç\s-]+)/, // Prénom Nom
    /([A-Z]{2,})\s+([A-Z][a-zéèêëàâîïôöûüç\s-]+)/, // NOM Prénom
  ];

  for (const line of lines.slice(0, 10)) {
    for (const pattern of namePatterns) {
      const match = line.match(pattern);
      if (match && match[1] && match[2]) {
        return {
          prenom: match[1].trim(),
          nom: match[2].trim()
        };
      }
    }
  }
  return { prenom: null, nom: null };
}

// Extraction des compétences dynamiques
function extractDynamicSkills(text) {
  const skillSections = ["Compétences", "Skills", "Expertise", "Logiciels", "PAO"];
  const lines = text.split('\n');
  let foundSkills = [];

  for (let i = 0; i < lines.length; i++) {
    if (skillSections.some(section => lines[i].includes(section))) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim().length === 0 || lines[j].match(/^[A-Z][a-z]+:/)) {
          break;
        }
        foundSkills.push(...lines[j].split(',').map(s => s.trim()));
      }
      break;
    }
  }
  return [...new Set(foundSkills)];
}

// Extraction des diplômes dynamiques
function extractDynamicDiplomas(text) {
  const diplomaSections = ["Formations", "Diplômes", "Éducation", "Formation"];
  const lines = text.split('\n');
  let foundDiplomas = [];

  for (let i = 0; i < lines.length; i++) {
    if (diplomaSections.some(section => lines[i].includes(section))) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim().length === 0 || lines[j].match(/^[A-Z][a-z]+:/)) {
          break;
        }
        foundDiplomas.push(lines[j].trim());
      }
      break;
    }
  }
  return foundDiplomas;
}

// Extraction des expériences professionnelles
function extractExperiences(text) {
  const experienceSections = ["Expérience", "Expériences", "Parcours Professionnel", "EXPÉRIENCES PROFESSIONNELLES"];
  const lines = text.split('\n');
  let experiences = [];
  let currentExperience = {};

  for (let i = 0; i < lines.length; i++) {
    if (experienceSections.some(section => lines[i].includes(section))) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim().length === 0 || lines[j].match(/^[A-Z][a-z]+:/)) {
          break;
        }
        if (lines[j].match(/\d{4}/)) {
          if (Object.keys(currentExperience).length > 0) {
            experiences.push(currentExperience);
            currentExperience = {};
          }
          currentExperience.periode = lines[j].trim();
        } else if (lines[j].trim().length > 0) {
          if (!currentExperience.poste) {
            currentExperience.poste = lines[j].trim();
          } else if (!currentExperience.description) {
            currentExperience.description = lines[j].trim();
          } else {
            currentExperience.description += " " + lines[j].trim();
          }
        }
      }
      if (Object.keys(currentExperience).length > 0) {
        experiences.push(currentExperience);
      }
      break;
    }
  }
  return experiences;
}

// Extraction des informations de contact
function extractContactInfo(text) {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}/g;

  const emails = text.match(emailRegex) || [];
  const phones = text.match(phoneRegex) || [];

  return {
    email: emails[0] || null,
    telephone: phones[0] || null,
  };
}

// Route principale
app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: "filePath est requis" });
    }

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        error: "Configuration Supabase manquante"
      });
    }

    // Télécharger le fichier depuis Supabase
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      return res.status(404).json({
        success: false,
        error: "Fichier introuvable dans le bucket truthtalent",
        details: downloadError.message
      });
    }

    if (!file) {
      return res.status(404).json({
        success: false,
        error: "Fichier vide ou inaccessible"
      });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileType = filePath.split('.').pop().toLowerCase();

    const rawText = await extractTextFromFile(fileBuffer, fileType);

    // Extraire les informations
    const { prenom, nom } = extractName(rawText);
    const skills = extractDynamicSkills(rawText);
    const diplomas = extractDynamicDiplomas(rawText);
    const experiences = extractExperiences(rawText);
    const { email, telephone } = extractContactInfo(rawText);

    // Calculer les années d'expérience
    let totalExperience = 0;
    const experienceMatch = rawText.match(/(\d+)\s*(?:ans?|années?)\s*d'expérience/i);
    if (experienceMatch) {
      totalExperience = parseInt(experienceMatch[1]);
    }

    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;

    const response = {
      success: true,
      candidateInfo: {
        nom,
        prenom,
        email,
        telephone,
        competences: skills,
        diplomes: diplomas,
        experiences,
        annees_experience: totalExperience,
        niveau: diplomas.length > 0 ? diplomas[diplomas.length - 1] : "Non spécifié",
        cv_url: cvUrl,
        cv_filename: filePath.split('/').pop(),
      }
    };

    res.status(200).json(response);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: "OK",
    message: "API d'analyse de CV opérationnelle",
    supabase_configured: !!(supabaseUrl && supabaseKey)
  });
});

export default app;
