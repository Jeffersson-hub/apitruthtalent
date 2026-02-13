// ============================================
// API D'ANALYSE DE CV - Version Vercel
// Migration complète depuis AWS Lambda
// ============================================

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const natural = require('natural');

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

// Configuration Express pour Vercel
const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Middleware CORS
app.use(cors({
  origin: ['https://truthtalent.online', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// ============================================
// BASES DE DONNÉES DE COMPÉTENCES (identiques à l'original)
// ============================================
const technicalSkills = new Set([
  // Programming Languages
  "JavaScript", "Python", "Java", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "Go", "Rust",
  "TypeScript", "Scala", "Perl", "R", "MATLAB", "Dart",
  // Web Technologies
  "HTML", "CSS", "React", "Angular", "Vue", "Node.js", "Express", "Django", "Flask", "Spring",
  "jQuery", "Bootstrap", "Tailwind", "SASS", "Redux", "Next.js", "Nuxt.js", "Gatsby",
  // Databases
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Oracle", "SQLite", "MariaDB",
  "Firebase", "DynamoDB", "Cassandra", "Elasticsearch",
  // Cloud & DevOps
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "CI/CD",
  "GitHub Actions", "GitLab CI", "Ansible", "Puppet", "Chef", "Prometheus", "Grafana",
  // Data Science
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Keras", "Scikit-learn",
  "Pandas", "NumPy", "Matplotlib", "Seaborn", "Tableau", "Power BI", "Apache Spark",
  // Mobile
  "Android", "iOS", "React Native", "Flutter", "Xamarin", "Ionic", "SwiftUI", "Jetpack Compose",
  // Other
  "Git", "Linux", "Agile", "Scrum", "Kanban", "REST", "GraphQL", "Microservices",
  "JIRA", "Confluence", "Trello", "Slack", "Figma", "Adobe XD", "Photoshop"
]);

const softSkills = new Set([
  "Communication", "Leadership", "Teamwork", "Problem Solving", "Time Management",
  "Adaptability", "Creativity", "Critical Thinking", "Emotional Intelligence",
  "Project Management", "Negotiation", "Conflict Resolution", "Decision Making",
  "Active Listening", "Empathy", "Collaboration", "Organization", "Reliability",
  "Flexibility", "Innovation", "Strategic Planning", "Mentoring", "Coaching"
]);

// ============================================
// ROUTE PRINCIPALE D'ANALYSE
// ============================================
app.post('/analyze', upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Validation des entrées
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }

    const jobDescription = req.body.jobDescription || "";
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;

    // ========================================
    // 1. EXTRACTION DU TEXTE
    // ========================================
    let extractedText = "";
    
    if (fileName.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdfParse(fileBuffer);
      extractedText = pdfData.text;
    } else if (fileName.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value;
    } else {
      return res.status(400).json({ 
        error: "Format de fichier non supporté. Utilisez PDF ou DOCX." 
      });
    }

    // Nettoyage du texte
    const cleanText = extractedText
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s@.-]/g, ' ')
      .trim();

    // ========================================
    // 2. ANALYSE DES COMPÉTENCES
    // ========================================
    const tokens = tokenizer.tokenize(cleanText.toLowerCase());
    const foundTechnicalSkills = new Set();
    const foundSoftSkills = new Set();

    tokens.forEach(token => {
      technicalSkills.forEach(skill => {
        const skillLower = skill.toLowerCase();
        if (skillLower.includes(token) || token.includes(skillLower)) {
          foundTechnicalSkills.add(skill);
        }
      });
      softSkills.forEach(skill => {
        const skillLower = skill.toLowerCase();
        if (skillLower.includes(token) || token.includes(skillLower)) {
          foundSoftSkills.add(skill);
        }
      });
    });

    // ========================================
    // 3. ANALYSE TF-IDF (mots-clés importants)
    // ========================================
    const tfidf = new TfIdf();
    tfidf.addDocument(cleanText);
    const importantKeywords = [];
    
    tfidf.listTerms(0).forEach(item => {
      if (item.tfidf > 0.15 && item.term.length > 3) {
        importantKeywords.push({
          term: item.term,
          score: parseFloat(item.tfidf.toFixed(3))
        });
      }
    });

    // ========================================
    // 4. ANALYSE JOB DESCRIPTION
    // ========================================
    let requiredSkills = new Set();
    let skillMatchPercentage = 0;
    let missingSkills = [];

    if (jobDescription) {
      const jdTokens = tokenizer.tokenize(jobDescription.toLowerCase());
      
      jdTokens.forEach(token => {
        technicalSkills.forEach(skill => {
          const skillLower = skill.toLowerCase();
          if (skillLower.includes(token) || token.includes(skillLower)) {
            requiredSkills.add(skill);
          }
        });
      });

      const matchedSkills = Array.from(requiredSkills)
        .filter(skill => foundTechnicalSkills.has(skill));
      
      missingSkills = Array.from(requiredSkills)
        .filter(skill => !foundTechnicalSkills.has(skill));
      
      skillMatchPercentage = requiredSkills.size > 0
        ? Math.round((matchedSkills.length / requiredSkills.size) * 100)
        : 0;
    }

    // ========================================
    // 5. INFORMATIONS CANDIDAT
    // ========================================
    const candidateInfo = extractCandidateInfo(cleanText);
    
    // ========================================
    // 6. STRUCTURATION DU CV
    // ========================================
    const sections = sectionizeResume(cleanText);
    
    // ========================================
    // 7. ANALYSE EXPÉRIENCE
    // ========================================
    const workExperienceAnalysis = analyzeWorkExperience(sections.experience || []);
    
    // ========================================
    // 8. ANALYSE LISIBILITÉ
    // ========================================
    const readabilityAnalysis = analyzeReadability(cleanText);
    
    // ========================================
    // 9. SUGGESTIONS D'EMPLOI
    // ========================================
    const jobSuggestions = generateJobSuggestions(foundTechnicalSkills);
    
    // ========================================
    // 10. SCORE ATS GLOBAL
    // ========================================
    const atsScore = calculateATSScore({
      cleanText,
      foundTechnicalSkills,
      foundSoftSkills,
      sections,
      readability: readabilityAnalysis
    });

    // ========================================
    // RÉPONSE FINALE
    // ========================================
    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      processingTime: `${processingTime}ms`,
      fileName: fileName,
      fileSize: req.file.size,
      
      // Résumé du CV
      summary: {
        text: cleanText.slice(0, 500) + "...",
        wordCount: cleanText.split(/\s+/).length,
        estimatedPages: Math.ceil(cleanText.split(/\s+/).length / 300)
      },
      
      // Informations personnelles
      candidateInfo: {
        name: candidateInfo.nom,
        email: candidateInfo.email,
        phone: candidateInfo.telephone,
        location: candidateInfo.location
      },
      
      // Analyse des compétences
      skills: {
        technical: Array.from(foundTechnicalSkills).sort(),
        technical_count: foundTechnicalSkills.size,
        soft: Array.from(foundSoftSkills).sort(),
        soft_count: foundSoftSkills.size,
        all_skills: Array.from(new Set([...foundTechnicalSkills, ...foundSoftSkills])).sort()
      },
      
      // Score ATS
      ats: {
        overall_score: `${atsScore.overall}%`,
        skill_match: jobDescription ? `${skillMatchPercentage}%` : 'N/A',
        format_score: `${atsScore.format}%`,
        readability_score: `${atsScore.readability}%`,
        keyword_density: atsScore.keywordDensity,
        
        // Si job description fournie
        job_match: jobDescription ? {
          percentage: `${skillMatchPercentage}%`,
          matched_skills: Array.from(requiredSkills)
            .filter(skill => foundTechnicalSkills.has(skill))
            .slice(0, 20),
          missing_skills: missingSkills.slice(0, 15),
          required_skills_count: requiredSkills.size,
          matched_count: Array.from(requiredSkills)
            .filter(skill => foundTechnicalSkills.has(skill)).length
        } : null
      },
      
      // Mots-clés importants
      keywords: {
        tfidf: importantKeywords.slice(0, 30),
        all: importantKeywords.map(k => k.term).slice(0, 50)
      },
      
      // Structure du CV
      sections: {
        present: Object.keys(sections).filter(k => sections[k].length > 0),
        details: sections
      },
      
      // Analyse de l'expérience
      experience_analysis: workExperienceAnalysis,
      
      // Lisibilité
      readability: readabilityAnalysis,
      
      // Suggestions d'emploi
      job_suggestions: jobSuggestions,
      
      // Recommandations d'amélioration
      recommendations: generateRecommendations({
        atsScore: atsScore.overall,
        missingSkills,
        readabilityAnalysis,
        workExperienceAnalysis,
        sections
      })
    });

  } catch (error) {
    console.error('❌ Erreur analyse:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// FONCTIONS HELPER (optimisées)
// ============================================

function extractCandidateInfo(text) {
  const info = {
    nom: null,
    email: null,
    telephone: null,
    location: null
  };

  // Email
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex);
  if (emails) info.email = emails[0];

  // Téléphone (formats internationaux)
  const phoneRegex = /(\+?\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}/g;
  const phones = text.match(phoneRegex);
  if (phones) info.telephone = phones[0];

  // Nom (recherche améliorée)
  const lines = text.split('\n');
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();
    if (line && 
        line.length < 50 && 
        !line.includes('@') && 
        !line.match(/\d{3}/) &&
        !line.match(/^(cv|resume|curriculum|vitae|candidat|profile|summary)/i)) {
      
      const words = line.split(' ');
      if (words.length >= 2 && words.length <= 4) {
        const hasCapitalLetters = words.filter(w => /^[A-Z]/.test(w)).length >= 2;
        if (hasCapitalLetters) {
          info.nom = line;
          break;
        }
      }
    }
  }

  // Localisation (approximation)
  const locationKeywords = ['paris', 'lyon', 'marseille', 'bordeaux', 'lille', 'toulouse', 'nice', 'nantes', 'strasbourg', 'montpellier', 'rennes', 'le havre'];
  const textLower = text.toLowerCase();
  for (const city of locationKeywords) {
    if (textLower.includes(city)) {
      info.location = city.charAt(0).toUpperCase() + city.slice(1);
      break;
    }
  }

  return info;
}

function sectionizeResume(text) {
  const sections = {
    header: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    languages: [],
    interests: []
  };
  
  const lines = text.split('\n');
  let currentSection = 'header';

  const sectionPatterns = [
    { name: 'summary', patterns: [/^summary$/i, /^professional summary$/i, /^profile$/i, /^about me$/i, /^résumé$/i, /^profil$/i] },
    { name: 'experience', patterns: [/^experience$/i, /^work experience$/i, /^professional experience$/i, /^employment$/i, /^work history$/i, /^expérience$/i, /^emploi$/i] },
    { name: 'education', patterns: [/^education$/i, /^academic background$/i, /^studies$/i, /^formation$/i, /^diplômes$/i, /^études$/i] },
    { name: 'skills', patterns: [/^skills$/i, /^technical skills$/i, /^core competencies$/i, /^expertise$/i, /^compétences$/i] },
    { name: 'projects', patterns: [/^projects$/i, /^personal projects$/i, /^projets$/i] },
    { name: 'certifications', patterns: [/^certifications$/i, /^certificates$/i, /^licenses$/i, /^certifications$/i] },
    { name: 'languages', patterns: [/^languages$/i, /^langues$/i] },
    { name: 'interests', patterns: [/^interests$/i, /^hobbies$/i, /^centres d'intérêt$/i] }
  ];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let isSectionHeader = false;
    
    for (const section of sectionPatterns) {
      if (section.patterns.some(pattern => pattern.test(trimmed))) {
        currentSection = section.name;
        isSectionHeader = true;
        break;
      }
    }

    if (!isSectionHeader) {
      sections[currentSection].push(trimmed);
    }
  });

  // Nettoyer les sections vides
  Object.keys(sections).forEach(key => {
    if (sections[key].length === 0) {
      delete sections[key];
    }
  });

  return sections;
}

function analyzeWorkExperience(experienceLines) {
  if (!experienceLines || experienceLines.length === 0) {
    return {
      present: false,
      feedback: ["Section expérience non détectée"],
      action_verbs_score: 0,
      quantifiable_score: 0,
      suggestions: ["Ajoutez une section expérience professionnelle"]
    };
  }

  const actionVerbs = new Set([
    "developed", "created", "implemented", "managed", "led", "coordinated", "improved",
    "optimized", "reduced", "increased", "launched", "designed", "deployed", "tested",
    "maintained", "trained", "mentored", "negotiated", "analyzed", "automated",
    "développé", "créé", "implémenté", "géré", "dirigé", "coordonné", "amélioré",
    "optimisé", "réduit", "augmenté", "lancé", "conçu", "déployé", "testé", "maintenu"
  ]);

  const bulletPoints = experienceLines.filter(line => line.length > 10);
  let actionVerbCount = 0;
  let quantifiableCount = 0;
  const suggestions = [];

  bulletPoints.forEach(bullet => {
    const firstWord = bullet.toLowerCase().split(' ')[0].replace(/[^a-z]/g, '');
    
    if (actionVerbs.has(firstWord)) {
      actionVerbCount++;
    } else {
      suggestions.push({
        bullet: bullet.slice(0, 100),
        suggestion: `Commencez par un verbe d'action (ex: ${Array.from(actionVerbs).slice(0, 3).join(', ')})`
      });
    }

    if (/\d+%|\d+\s+(years?|months?|ans?|mois)|€|\$|£|\d+\s+people|\d+\s+clients?/.test(bullet)) {
      quantifiableCount++;
    } else {
      suggestions.push({
        bullet: bullet.slice(0, 100),
        suggestion: "Ajoutez des résultats quantifiables (%, chiffres, €)"
      });
    }
  });

  const actionVerbScore = bulletPoints.length > 0 
    ? Math.round((actionVerbCount / bulletPoints.length) * 100)
    : 0;
  
  const quantifiableScore = bulletPoints.length > 0
    ? Math.round((quantifiableCount / bulletPoints.length) * 100)
    : 0;

  return {
    present: true,
    total_bullets: bulletPoints.length,
    action_verbs: {
      count: actionVerbCount,
      score: actionVerbScore,
      feedback: actionVerbScore > 70 ? "Excellent usage des verbes d'action" : "Plus de verbes d'action recommandé"
    },
    quantifiable: {
      count: quantifiableCount,
      score: quantifiableScore,
      feedback: quantifiableScore > 50 ? "Bon usage des métriques" : "Ajoutez plus de résultats mesurables"
    },
    suggestions: suggestions.slice(0, 5)
  };
}

function analyzeReadability(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;
  
  const avgWordsPerSentence = sentenceCount > 0 
    ? Math.round(wordCount / sentenceCount)
    : 0;
  
  const longSentences = sentences.filter(s => 
    s.split(/\s+/).filter(w => w.length > 0).length > 25
  ).length;

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const avgParagraphLength = paragraphs.length > 0
    ? Math.round(wordCount / paragraphs.length)
    : 0;

  const feedback = [];
  const score = { format: 0, readability: 0 };

  // Score de format
  if (wordCount < 300) {
    feedback.push("CV trop court (idéal: 400-800 mots)");
    score.format = 40;
  } else if (wordCount > 1200) {
    feedback.push("CV trop long (idéal: 400-800 mots)");
    score.format = 50;
  } else {
    score.format = 80;
    feedback.push("Longueur de CV idéale");
  }

  // Score de lisibilité
  if (avgWordsPerSentence > 25) {
    feedback.push(`Phrases trop longues (moyenne: ${avgWordsPerSentence} mots, idéal: <20)`);
    score.readability = 40;
  } else if (avgWordsPerSentence > 20) {
    feedback.push(`Phrases un peu longues (moyenne: ${avgWordsPerSentence} mots)`);
    score.readability = 60;
  } else {
    score.readability = 80;
    feedback.push("Bonne longueur de phrases");
  }

  if (longSentences > 0) {
    feedback.push(`${longSentences} phrase(s) très longue(s) (>25 mots)`);
  }

  return {
    words: wordCount,
    sentences: sentenceCount,
    paragraphs: paragraphs.length,
    avg_words_per_sentence: avgWordsPerSentence,
    avg_words_per_paragraph: avgParagraphLength,
    long_sentences: longSentences,
    estimated_pages: Math.ceil(wordCount / 300),
    scores: score,
    feedback: feedback.slice(0, 5)
  };
}

function generateJobSuggestions(skills) {
  const jobRoles = [
    {
      title: "Développeur Full Stack",
      required: ["JavaScript", "React", "Node.js", "HTML", "CSS", "SQL"],
      optional: ["TypeScript", "MongoDB", "Express", "AWS", "Git"],
      weight: 1
    },
    {
      title: "Développeur Backend",
      required: ["Python", "Java", "SQL", "Node.js", "REST"],
      optional: ["Django", "Spring", "Microservices", "AWS", "Docker"],
      weight: 1
    },
    {
      title: "Data Scientist",
      required: ["Python", "Machine Learning", "SQL", "Pandas", "NumPy"],
      optional: ["TensorFlow", "PyTorch", "R", "Tableau", "Apache Spark"],
      weight: 1
    },
    {
      title: "DevOps Engineer",
      required: ["AWS", "Docker", "Linux", "CI/CD", "Git"],
      optional: ["Kubernetes", "Terraform", "Jenkins", "Python", "Ansible"],
      weight: 1
    },
    {
      title: "Chef de Projet IT",
      required: ["Agile", "Scrum", "JIRA", "Communication", "Management"],
      optional: ["PMP", "Prince2", "Risk Management", "Budgeting", "Client Relations"],
      weight: 0.9
    },
    {
      title: "Développeur Frontend",
      required: ["JavaScript", "React", "HTML", "CSS", "TypeScript"],
      optional: ["Vue", "Angular", "Redux", "Webpack", "Jest"],
      weight: 1
    },
    {
      title: "Développeur Mobile",
      required: ["React Native", "Flutter", "Android", "iOS", "Swift"],
      optional: ["Kotlin", "Java", "Firebase", "REST", "UI/UX"],
      weight: 1
    },
    {
      title: "Cloud Architect",
      required: ["AWS", "Azure", "GCP", "Docker", "Kubernetes"],
      optional: ["Terraform", "Networking", "Security", "Python", "Go"],
      weight: 0.9
    }
  ];

  const skillsArray = Array.from(skills).map(s => s.toLowerCase());
  
  return jobRoles
    .map(role => {
      const requiredMatch = role.required.filter(skill => 
        skillsArray.some(s => s.includes(skill.toLowerCase()) || skill.toLowerCase().includes(s))
      ).length;
      
      const optionalMatch = role.optional.filter(skill => 
        skillsArray.some(s => s.includes(skill.toLowerCase()) || skill.toLowerCase().includes(s))
      ).length;
      
      const requiredScore = (requiredMatch / role.required.length) * 70;
      const optionalScore = (optionalMatch / role.optional.length) * 30;
      const matchScore = Math.round(requiredScore + optionalScore);
      
      return {
        title: role.title,
        matchScore: matchScore,
        matchPercentage: `${matchScore}%`,
        matchingSkills: role.required
          .filter(skill => skillsArray.some(s => s.includes(skill.toLowerCase())))
          .concat(role.optional.filter(skill => skillsArray.some(s => s.includes(skill.toLowerCase()))))
          .slice(0, 8),
        missingSkills: role.required
          .filter(skill => !skillsArray.some(s => s.includes(skill.toLowerCase())))
          .slice(0, 5)
      };
    })
    .filter(role => role.matchScore > 30)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}

function calculateATSScore({ cleanText, foundTechnicalSkills, foundSoftSkills, sections, readability }) {
  let format = 0;
  let readability_score = 0;
  let keyword_density = 0;

  // Score de format
  if (sections.experience) format += 30;
  if (sections.education) format += 20;
  if (sections.skills) format += 25;
  if (sections.summary) format += 15;
  
  format = Math.min(100, format + 10); // Bonus

  // Score de lisibilité
  readability_score = readability.scores?.readability || 60;

  // Densité des mots-clés
  const wordCount = cleanText.split(/\s+/).length;
  const skillCount = foundTechnicalSkills.size + foundSoftSkills.size;
  keyword_density = wordCount > 0 
    ? parseFloat(((skillCount * 3) / wordCount * 100).toFixed(1))
    : 0;

  const overall = Math.round((format * 0.4 + readability_score * 0.3 + Math.min(100, keyword_density * 2) * 0.3));

  return {
    overall,
    format,
    readability: readability_score,
    keywordDensity: `${keyword_density}%`
  };
}

function generateRecommendations({ atsScore, missingSkills, readabilityAnalysis, workExperienceAnalysis, sections }) {
  const recommendations = [];

  if (atsScore < 50) {
    recommendations.push({
      priority: "Haute",
      category: "ATS",
      message: "Votre CV n'est pas optimisé pour les ATS",
      suggestions: [
        "Utilisez un format standard (PDF)",
        "Évitez les tableaux et colonnes complexes",
        "Incluez des mots-clés spécifiques au poste"
      ]
    });
  }

  if (missingSkills && missingSkills.length > 0) {
    recommendations.push({
      priority: "Haute",
      category: "Compétences",
      message: `${missingSkills.length} compétences requises non détectées`,
      suggestions: missingSkills.slice(0, 5).map(s => `Ajoutez "${s}" à votre section compétences`)
    });
  }

  if (readabilityAnalysis.feedback?.length > 0) {
    recommendations.push({
      priority: "Moyenne",
      category: "Lisibilité",
      message: "Améliorez la lisibilité de votre CV",
      suggestions: readabilityAnalysis.feedback.slice(0, 3)
    });
  }

  if (workExperienceAnalysis.suggestions?.length > 0) {
    recommendations.push({
      priority: "Moyenne",
      category: "Expérience",
      message: "Optimisez vos descriptions d'expérience",
      suggestions: workExperienceAnalysis.suggestions.slice(0, 3).map(s => s.suggestion)
    });
  }

  if (!sections.summary) {
    recommendations.push({
      priority: "Basse",
      category: "Structure",
      message: "Ajoutez un résumé professionnel",
      suggestions: ["Un résumé de 2-3 phrases en haut du CV augmente l'impact"]
    });
  }

  return recommendations;
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Resume Analyzer API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// EXPORT POUR VERCEL
// ============================================
module.exports = app;