// api/analyze/index.js - Adapté pour Vercel Serverless Functions
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const natural = require("natural");
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;
const tfidf = new TfIdf();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Configuration CORS
const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  return await fn(req, res);
};

// Base de données de compétences (identique à votre code)
const technicalSkills = new Set([
  "JavaScript", "Python", "Java", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "Go", "Rust",
  "HTML", "CSS", "React", "Angular", "Vue", "Node.js", "Express", "Django", "Flask", "Spring",
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Oracle", "SQLite",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "CI/CD",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy", "R",
  "Android", "iOS", "React Native", "Flutter",
  "Git", "Linux", "Agile", "Scrum", "REST", "GraphQL", "Microservices"
]);

const softSkills = new Set([
  "Communication", "Leadership", "Teamwork", "Problem Solving", "Time Management",
  "Adaptability", "Creativity", "Critical Thinking", "Emotional Intelligence",
  "Project Management", "Negotiation", "Conflict Resolution"
]);

// ============================================
// FONCTION PRINCIPALE (adaptée de votre Lambda)
// ============================================
const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // Utiliser multer pour parser le fichier
    await new Promise((resolve, reject) => {
      upload.single('file')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier uploadé' });
    }

    // Job description optionnelle
    const jobDescription = req.body.jobDescription || "";

    let extractedText = "";

    // Extraire le texte selon le type de fichier
    if (file.originalname.endsWith('.pdf')) {
      const data = await pdfParse(file.buffer);
      extractedText = data.text;
    } else if (file.originalname.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } else {
      return res.status(400).json({ 
        error: "Format non supporté. Utilisez PDF ou DOCX." 
      });
    }

    // Nettoyer le texte
    const cleanText = extractedText.replace(/\s+/g, " ").trim();

    // === ANALYSE SANS AWS COMPREHEND ===
    // (Version simplifiée car Vercel ne peut pas appeler AWS Comprehend directement)
    
    // Extraction des compétences
    const tokens = tokenizer.tokenize(cleanText.toLowerCase());
    const foundTechnicalSkills = new Set();
    const foundSoftSkills = new Set();

    tokens.forEach(token => {
      technicalSkills.forEach(skill => {
        if (skill.toLowerCase().includes(token) || token.includes(skill.toLowerCase())) {
          foundTechnicalSkills.add(skill);
        }
      });
      softSkills.forEach(skill => {
        if (skill.toLowerCase().includes(token) || token.includes(skill.toLowerCase())) {
          foundSoftSkills.add(skill);
        }
      });
    });

    // Analyse TF-IDF
    tfidf.addDocument(cleanText);
    const importantKeywords = new Set();
    tfidf.listTerms(0).slice(0, 20).forEach(item => {
      if (item.tfidf > 0.1) {
        importantKeywords.add(item.term);
      }
    });

    // Analyse du job description si fourni
    let requiredSkills = new Set();
    let skillMatchPercentage = 0;
    let missingSkills = [];

    if (jobDescription) {
      const jdTokens = tokenizer.tokenize(jobDescription.toLowerCase());
      jdTokens.forEach(token => {
        technicalSkills.forEach(skill => {
          if (skill.toLowerCase().includes(token) || token.includes(skill.toLowerCase())) {
            requiredSkills.add(skill);
          }
        });
      });

      missingSkills = Array.from(requiredSkills)
        .filter(skill => !foundTechnicalSkills.has(skill));
      
      skillMatchPercentage = requiredSkills.size > 0 
        ? Math.round(((foundTechnicalSkills.size / requiredSkills.size) * 100))
        : 0;
    }

    // Informations candidat
    const candidateInfo = extractCandidateInfo(cleanText);
    
    // Analyse des sections
    const sections = sectionizeResume(cleanText);
    
    // Analyse de l'expérience
    const workExperienceAnalysis = analyzeWorkExperience(sections.experience || []);
    
    // Analyse de lisibilité
    const readabilityAnalysis = analyzeReadability(cleanText);
    
    // Suggestions d'emploi
    const jobSuggestions = generateJobSuggestions(foundTechnicalSkills);

    // Réponse
    return res.status(200).json({
      success: true,
      wordCount: cleanText.split(/\s+/).length,
      summary: cleanText.slice(0, 300) + "...",
      candidateInfo: candidateInfo,
      skills: {
        technical: Array.from(foundTechnicalSkills).slice(0, 30),
        soft: Array.from(foundSoftSkills).slice(0, 20),
        matchPercentage: `${skillMatchPercentage}%`,
        missing: missingSkills.slice(0, 15)
      },
      ats: {
        score: `${skillMatchPercentage}%`,
        missingKeywords: missingSkills.slice(0, 15),
        foundKeywords: Array.from(requiredSkills)
          .filter(skill => foundTechnicalSkills.has(skill))
          .slice(0, 20)
      },
      importantKeywords: Array.from(importantKeywords).slice(0, 30),
      jobSuggestions: jobSuggestions,
      workExperienceAnalysis: workExperienceAnalysis,
      readabilityAnalysis: readabilityAnalysis,
      sections: {
        hasSummary: !!sections.summary,
        hasExperience: !!sections.experience,
        hasEducation: !!sections.education,
        hasSkills: !!sections.skills
      }
    });

  } catch (error) {
    console.error('Erreur API:', error);
    return res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
};

// ============================================
// FONCTIONS HELPER (copiées de votre Lambda)
// ============================================

function extractCandidateInfo(text) {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const phoneRegex = /(0[1-9][0-9]{8})|(\+33[0-9]{9})/;
  
  // Nom : première ligne non-vide qui n'est pas un email/téléphone
  const lines = text.split('\n');
  let name = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && 
        trimmed.length < 50 && 
        !trimmed.includes('@') && 
        !trimmed.match(phoneRegex) &&
        !trimmed.match(/^(cv|resume|curriculum|vitae)/i)) {
      name = trimmed;
      break;
    }
  }

  const emailMatch = text.match(emailRegex);
  const phoneMatch = text.match(phoneRegex);

  return {
    nom: name,
    email: emailMatch ? emailMatch[0] : null,
    telephone: phoneMatch ? phoneMatch[0] : null
  };
}

function sectionizeResume(text) {
  const sections = {};
  const lines = text.split('\n');
  let currentSection = 'header';
  sections[currentSection] = [];

  const sectionKeywords = {
    summary: /^(summary|profil|about|résumé|profile)/i,
    experience: /^(experience|work experience|professional experience|employment|expérience)/i,
    education: /^(education|formation|academic|studies|études)/i,
    skills: /^(skills|technical skills|compétences|expertise)/i,
    projects: /^(projects|projets)/i,
    certifications: /^(certifications|certificates)/i
  };

  lines.forEach(line => {
    let isSectionHeader = false;
    for (const [section, regex] of Object.entries(sectionKeywords)) {
      if (regex.test(line.trim())) {
        currentSection = section;
        sections[currentSection] = [];
        isSectionHeader = true;
        break;
      }
    }

    if (!isSectionHeader && line.trim()) {
      if (!sections[currentSection]) sections[currentSection] = [];
      sections[currentSection].push(line.trim());
    }
  });

  return sections;
}

function analyzeWorkExperience(experienceLines) {
  if (!experienceLines || experienceLines.length === 0) {
    return {
      hasExperience: false,
      feedback: "Section expérience non trouvée ou vide."
    };
  }

  const actionVerbs = [
    "développé", "créé", "implémenté", "géré", "dirigé", "coordonné",
    "amélioré", "optimisé", "réduit", "augmenté", "lancé", "conçu",
    "déployé", "testé", "maintenu", "formé", "encadré", "négocié",
    "analysé", "automatisé", "développed", "created", "managed",
    "implemented", "improved", "reduced", "increased", "designed"
  ];

  const actionVerbCheck = [];
  const quantifiableCheck = [];

  experienceLines.forEach(line => {
    const firstWord = line.split(' ')[0].toLowerCase();
    if (!actionVerbs.includes(firstWord) && !actionVerbs.includes(firstWord.replace(/[^a-z]/g, ''))) {
      actionVerbCheck.push({
        bullet: line.slice(0, 100),
        feedback: "Commencez par un verbe d'action fort"
      });
    }

    if (!/\d+%|\d+\s+(ans?|années?|mois)|€|\$|£/.test(line)) {
      quantifiableCheck.push({
        bullet: line.slice(0, 100),
        feedback: "Ajoutez des résultats quantifiables (%, €, années)"
      });
    }
  });

  return {
    hasExperience: true,
    actionVerbCheck: actionVerbCheck.slice(0, 5),
    quantifiableCheck: quantifiableCheck.slice(0, 5),
    feedback: actionVerbCheck.length + quantifiableCheck.length > 0 
      ? "Quelques améliorations possibles" 
      : "Bon format d'expérience"
  };
}

function analyzeReadability(text) {
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
  const pages = Math.max(1, Math.ceil(words / 250));
  const longSentences = text.split(/[.!?]+/)
    .filter(s => s.split(/\s+/).length > 25).length;

  const feedback = [];
  if (pages > 2) feedback.push(`CV de ${pages} pages. Idéalement 1-2 pages.`);
  if (longSentences > 0) feedback.push(`${longSentences} phrase(s) longue(s) > 25 mots.`);
  if (words < 200) feedback.push("CV très court, ajoutez plus de détails.");

  return {
    pages,
    words,
    longSentences,
    feedback: feedback.length ? feedback : ["Lisibilité correcte"]
  };
}

function generateJobSuggestions(skills) {
  const suggestions = [
    {
      title: "Développeur Full Stack",
      keywords: ["JavaScript", "React", "Node.js", "SQL", "HTML", "CSS"],
      weight: 1
    },
    {
      title: "Développeur Backend",
      keywords: ["Python", "Java", "SQL", "Node.js", "API", "Microservices"],
      weight: 1
    },
    {
      title: "Data Scientist",
      keywords: ["Python", "Machine Learning", "SQL", "Pandas", "NumPy"],
      weight: 1
    },
    {
      title: "DevOps Engineer",
      keywords: ["AWS", "Docker", "Kubernetes", "CI/CD", "Linux"],
      weight: 1
    },
    {
      title: "Chef de Projet IT",
      keywords: ["Agile", "Scrum", "Management", "JIRA", "Communication"],
      weight: 0.8
    }
  ];

  const skillsArray = Array.from(skills).map(s => s.toLowerCase());
  
  return suggestions
    .map(job => {
      const matchCount = job.keywords.filter(k => 
        skillsArray.some(s => s.includes(k.toLowerCase()) || k.toLowerCase().includes(s))
      ).length;
      const matchScore = Math.round((matchCount / job.keywords.length) * 100);
      
      return {
        title: job.title,
        matchScore: matchScore,
        matchingSkills: job.keywords.filter(k => 
          skillsArray.some(s => s.includes(k.toLowerCase()))
        ).slice(0, 5),
        missingRequired: job.keywords.filter(k => 
          !skillsArray.some(s => s.includes(k.toLowerCase()))
        ).slice(0, 3)
      };
    })
    .filter(job => job.matchScore > 20)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
}

// Exporter avec CORS
module.exports = allowCors(handler);