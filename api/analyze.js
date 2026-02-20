// api/analyze.js - Version corrigée pour Vercel serverless
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';

const { WordTokenizer } = natural;

const app = express();

// ✅ CORRECTION : Supprimer la ligne en double
app.use(express.json({ limit: '50mb' }));

// ✅ CORRECTION : Vérifier les variables d'environnement
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement Supabase manquantes");
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');

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

/**
 * Extrait les mots-clés d'un texte
 */
function extractKeywords(text) {
  if (!text) return [];
  
  const tokenizer = new WordTokenizer();
  const words = tokenizer.tokenize(text.toLowerCase());

  // Stopwords français
  const stopwords = new Set([
    'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'est', 'sont',
    'pour', 'dans', 'sur', 'avec', 'par', 'ce', 'cet', 'cette', 'ces',
    'qui', 'que', 'quoi', 'dont', 'ou', 'où', 'comment', 'pourquoi',
    'mon', 'ton', 'son', 'notre', 'votre', 'leur', 'ma', 'ta', 'sa',
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'
  ]);
  
  return words.filter(word => !stopwords.has(word) && word.length > 2);
}

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
  // Chercher des patterns de nom dans les premières lignes
  const namePatterns = [
    /([A-Z][a-zéèêëàâîïôöûüç-]+)\s+([A-Z][a-zéèêëàâîïôöûüç-]+)/, // Prénom Nom
    /([A-Z]{2,})\s+([A-Z][a-zéèêëàâîïôöûüç-]+)/, // NOM Prénom
  ];
  
  for (const line of lines.slice(0, 10)) { // Chercher dans les 10 premières lignes
    for (const pattern of namePatterns) {
      const match = line.match(pattern);
      if (match) {
        // Déterminer quel groupe est le prénom et lequel est le nom
        if (match[1].length > 2 && match[2].length > 2) {
          return { 
            prenom: match[1].charAt(0) + match[1].slice(1).toLowerCase(), 
            nom: match[2].charAt(0) + match[2].slice(1).toLowerCase() 
          };
        }
      }
    }
  }
  return { prenom: null, nom: null };
}

// Fonction pour extraire les compétences
function extractSkills(text) {
  const lowerText = text.toLowerCase();
  const foundSkills = new Set();
  
  TECHNICAL_SKILLS.forEach(skill => {
    if (lowerText.includes(skill.toLowerCase())) {
      foundSkills.add(skill);
    }
  });
  
  return Array.from(foundSkills);
}

// Fonction pour extraire les diplômes
function extractDiplomas(text) {
  const foundDiplomas = [];
  const lowerText = text.toLowerCase();
  
  FRENCH_DIPLOMAS.forEach(diploma => {
    diploma.keywords.forEach(keyword => {
      if (lowerText.includes(keyword.toLowerCase())) {
        foundDiplomas.push(diploma.name);
      }
    });
  });
  
  return [...new Set(foundDiplomas)];
}

// Route principale
app.post('/api/analyze', async (req, res) => {
  console.log("📥 Requête reçue sur /api/analyze");
  
  try {
    const { filePath, jobDescription } = req.body;
    console.log("filePath:", filePath);
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: "filePath est requis" });
    }

    // ✅ Vérifier que Supabase est configuré
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ 
        success: false, 
        error: "Configuration Supabase manquante" 
      });
    }

    // 1. Télécharger le fichier depuis Supabase
    console.log("📥 Téléchargement du fichier depuis Supabase...");
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      console.error("Erreur téléchargement:", downloadError);
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
    
    console.log("📄 Extraction du texte du fichier...");
    const rawText = await extractTextFromFile(fileBuffer, fileType);
    console.log(`✅ Texte extrait: ${rawText.length} caractères`);

    // 2. Extraire les informations
    const { prenom, nom } = extractName(rawText);
    const skills = extractSkills(rawText);
    const diplomas = extractDiplomas(rawText);
    
    // Extraire email
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = rawText.match(emailRegex) || [];
    
    // Extraire téléphone (format français)
    const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
    const phones = rawText.match(phoneRegex) || [];

    // 3. Calculer les années d'expérience (estimation simple)
    let totalExperience = 0;
    const experienceMatch = rawText.match(/(\d+)\s*(?:ans?|années?)\s*d'expérience/i);
    if (experienceMatch) {
      totalExperience = parseInt(experienceMatch[1]);
    }

    // 4. Préparer la réponse
    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;
    
    const response = {
      success: true,
      candidateInfo: {
        nom: nom || null,
        prenom: prenom || null,
        email: emails[0] || null,
        telephone: phones[0] || null,
        competences: skills,
        diplomes: diplomas,
        annees_experience: totalExperience,
        niveau: diplomas.length > 0 ? diplomas[diplomas.length - 1] : "Non spécifié",
        cv_url: cvUrl,
        cv_filename: filePath.split('/').pop(),
      }
    };

    console.log("✅ Analyse terminée avec succès");
    res.status(200).json(response);
    
  } catch (error) {
    console.error("❌ Erreur détaillée:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
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

// ✅ CORRECTION : Exporter pour Vercel serverless
export default app;