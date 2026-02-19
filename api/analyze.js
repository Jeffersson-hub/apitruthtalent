// api/analyze.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Initialisation Supabase (utilisez des variables d'environnement)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Liste des compétences techniques courantes
const TECHNICAL_SKILLS = [
  "JavaScript", "React", "Node.js", "Python", "Java", "AWS", "Docker", "SQL",
  "TypeScript", "Angular", "Vue", "PHP", "HTML", "CSS", "Git", "CI/CD"
];

// Fonction pour extraire le texte d'un fichier (PDF ou DOCX)
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

// Fonction pour extraire les compétences
function extractSkills(text) {
  const foundSkills = new Set();
  const textLower = text.toLowerCase();
  TECHNICAL_SKILLS.forEach(skill => {
    if (textLower.includes(skill.toLowerCase())) {
      foundSkills.add(skill);
    }
  });
  return Array.from(foundSkills);
}

// Route principale
app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: "filePath est requis" });
    }

    // 1. Télécharger le fichier depuis Supabase Storage
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      return res.status(404).json({ success: false, error: "Fichier introuvable" });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileType = filePath.split('.').pop().toLowerCase();
    const rawText = await extractTextFromFile(fileBuffer, fileType);

    // 2. Extraire les informations de base
    const skills = extractSkills(rawText);
    const emails = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = rawText.match(/(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g) || [];

    // 3. Préparer la réponse
    const response = {
      success: true,
      candidateInfo: {
        nom: "Nom extrait",  // À améliorer avec une fonction d'extraction
        prenom: "Prénom extrait",  // À améliorer
        email: emails[0] || null,
        telephone: phones[0] || null,
        competences: skills,
        niveau: "Bac+5",  // À extraire du texte
        annees_experience: 3,  // À calculer
        cv_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/truthtalent/${filePath}`,
        cv_filename: filePath.split('/').pop(),
        raw_text: rawText.substring(0, 5000),  // Limité pour éviter les gros JSON
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
  res.json({
    status: "OK",
    message: "API d'analyse de CV opérationnelle"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

export default app;
