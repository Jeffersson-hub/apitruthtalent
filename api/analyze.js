// api/analyze.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';
import { WordTokenizer, PorterStemmerFr } from 'natural';

// Initialisation de Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json({ limit: '50mb' }));

// Liste des compétences techniques
const TECHNICAL_SKILLS = [
  "JavaScript", "React", "Node.js", "Python", "Java", "AWS", "Docker", "SQL", "TypeScript",
  "Angular", "Vue", "PHP", "HTML", "CSS", "Git", "CI/CD", "ERP", "SAP", "Salesforce"
];

// Liste des diplômes français
const FRENCH_DIPLOMAS = [
  { name: "CAP", keywords: ["CAP", "Certificat d'Aptitude Professionnelle"] },
  { name: "BEP", keywords: ["BEP", "Brevet d'Études Professionnelles"] },
  { name: "Bac", keywords: ["Bac", "Baccalauréat"] },
  { name: "BTS", keywords: ["BTS", "Brevet de Technicien Supérieur"] },
  { name: "DUT", keywords: ["DUT", "Diplôme Universitaire de Technologie"] },
  { name: "Licence", keywords: ["Licence", "Bac+3"] },
  { name: "Master", keywords: ["Master", "Bac+5", "Diplôme d'Ingénieur"] },
  { name: "Doctorat", keywords: ["Doctorat", "PhD", "Thèse", "Bac+8"] }
];

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
  const lines = text.split('\n');
  const nameRegex = /([A-Z][a-zéèêëàâîïôöûüç-]+)\s+([A-Z][a-zéèêëàâîïôöûüç-]+)/;
  for (const line of lines) {
    const match = line.match(nameRegex);
    if (match) {
      return { prenom: match[1], nom: match[2] };
    }
  }
  return { prenom: null, nom: null };
}

// Fonction pour extraire les compétences
function extractSkills(text) {
  const tokenizer = new WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const foundSkills = new Set();
  TECHNICAL_SKILLS.forEach(skill => {
    if (tokens.includes(skill.toLowerCase())) {
      foundSkills.add(skill);
    }
  });
  return Array.from(foundSkills);
}

// Fonction pour extraire les diplômes
function extractDiplomas(text) {
  const foundDiplomas = [];
  FRENCH_DIPLOMAS.forEach(diploma => {
    diploma.keywords.forEach(keyword => {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        foundDiplomas.push(diploma.name);
      }
    });
  });
  return [...new Set(foundDiplomas)];
}

// Fonction pour extraire les expériences
function extractExperiences(text) {
  const experienceRegex = /(\d{4})\s*[-–]\s*(\d{4}|présent|now)/gi;
  const experiences = [];
  let match;
  while ((match = experienceRegex.exec(text)) !== null) {
    experiences.push({
      startYear: match[1],
      endYear: match[2] === 'présent' || match[2] === 'now' ? new Date().getFullYear() : match[2]
    });
  }
  return experiences;
}

// Route principale
app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: "filePath est requis" });
    }

    // 1. Télécharger le fichier depuis Supabase
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      return res.status(404).json({ success: false, error: "Fichier introuvable" });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileType = filePath.split('.').pop().toLowerCase();
    const rawText = await extractTextFromFile(fileBuffer, fileType);

    // 2. Extraire les informations
    const { prenom, nom } = extractName(rawText);
    const skills = extractSkills(rawText);
    const diplomas = extractDiplomas(rawText);
    const experiences = extractExperiences(rawText);
    const emails = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = rawText.match(/(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g) || [];

    // 3. Calculer les années d'expérience
    let totalExperience = 0;
    experiences.forEach(exp => {
      const start = parseInt(exp.startYear);
      const end = exp.endYear === new Date().getFullYear() ? new Date().getFullYear() : parseInt(exp.endYear);
      totalExperience += (end - start);
    });

    // 4. Préparer la réponse
    const response = {
      success: true,
      candidateInfo: {
        nom: nom || null,
        prenom: prenom || null,
        email: emails[0] || null,
        telephone: phones[0] || null,
        competences: skills,
        diplomes: diplomas,
        experiences: experiences,
        annees_experience: totalExperience,
        niveau: diplomas.length > 0 ? diplomas[diplomas.length - 1] : "Non spécifié",
        cv_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/truthtalent/${filePath}`,
        cv_filename: filePath.split('/').pop(),
        raw_text: rawText.substring(0, 5000),
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Erreur:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: "OK", message: "API d'analyse de CV opérationnelle" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

export default app;
