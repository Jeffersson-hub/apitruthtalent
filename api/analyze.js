// ============================================
// API D'ANALYSE DE CV - Version Vercel Complète
// ============================================

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';
import multer from 'multer';
import express from 'express';

// Configuration
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

// ============================================
// BASES DE DONNÉES DE COMPÉTENCES
// ============================================
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
// HANDLER PRINCIPAL POUR VERCEL
// ============================================
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Parser le fichier uploadé
    await new Promise((resolve, reject) => {
      upload.single('file')(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Aucun fichier uploadé' });

    const jobDescription = req.body.jobDescription || "";
    
    // ========================================
    // 1. EXTRAIRE LE TEXTE
    // ========================================
    let extractedText = "";
    
    if (file.originalname.toLowerCase().endsWith('.pdf')) {
      const data = await pdfParse(file.buffer);
      extractedText = data.text;
    } else if (file.originalname.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      extractedText = result.value;
    } else {
      return res.status(400).json({ 
        error: "Format non supporté. Utilisez PDF ou DOCX." 
      });
    }

    const cleanText = extractedText.replace(/\s+/g, " ").trim();

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
    // 3. ANALYSE TF-IDF
    // ========================================
    const tfidf = new TfIdf();
    tfidf.addDocument(cleanText);
    const importantKeywords = [];
    tfidf.listTerms(0).forEach(item => {
      if (item.tfidf > 0.1 && item.term.length > 3) {
        importantKeywords.push(item.term);
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

      missingSkills = Array.from(requiredSkills)
        .filter(skill => !foundTechnicalSkills.has(skill));
      
      skillMatchPercentage = requiredSkills.size > 0 
        ? Math.round((foundTechnicalSkills.size / requiredSkills.size) * 100)
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
    // RÉPONSE FINALE
    // ========================================
    return res.status(200).json({
      success: true,
      wordCount: cleanText.split(/\s+/).length,
      summary: cleanText.slice(0, 300) + "...",
      candidateInfo: {
        nom: candidateInfo.name,
        email: candidateInfo.email,
        telephone: candidateInfo.phone
      },
      skills: {
        technical: Array.from(foundTechnicalSkills).slice(0, 50),
        soft: Array.from(foundSoftSkills).slice(0, 30),
        technical_count: foundTechnicalSkills.size,
        soft_count: foundSoftSkills.size
      },
      ats: {
        score: `${skillMatchPercentage}%`,
        missingKeywords: missingSkills.slice(0, 20),
        foundKeywords: Array.from(requiredSkills)
          .filter(skill => foundTechnicalSkills.has(skill))
          .slice(0, 20)
      },
      importantKeywords: importantKeywords.slice(0, 50),
      jobSuggestions: jobSuggestions,
      experienceAnalysis: {
        actionVerbs: workExperienceAnalysis.actionVerbCheck.length,
        quantifiable: workExperienceAnalysis.quantifiableCheck.length,
        suggestions: [
          ...workExperienceAnalysis.actionVerbCheck.slice(0, 3).map(i => i.feedback),
          ...workExperienceAnalysis.quantifiableCheck.slice(0, 3).map(i => i.feedback)
        ]
      },
      readability: {
        pages: readabilityAnalysis.pages,
        longSentences: readabilityAnalysis.longSentences,
        feedback: readabilityAnalysis.feedback
      }
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================
// FONCTIONS HELPER (copiées de votre Lambda)
// ============================================

function extractCandidateInfo(text) {
  const nameRegex = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/;
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;

  const nameMatch = text.match(nameRegex);
  const emailMatch = text.match(emailRegex);
  const phoneMatch = text.match(phoneRegex);

  return {
    name: nameMatch ? nameMatch[0].trim() : null,
    email: emailMatch ? emailMatch[0].trim() : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null
  };
}

function sectionizeResume(text) {
  const sections = {};
  const lines = text.split('\n');
  let currentSection = 'header';
  sections[currentSection] = [];

  const sectionKeywords = {
    summary: /^summary$/i,
    experience: /^experience$|^work experience$|^professional experience$/i,
    education: /^education$/i,
    skills: /^skills$|^technical skills$/i,
    projects: /^projects$/i,
    certifications: /^certifications$/i,
    awards: /^awards$|^honors and awards$/i,
    publications: /^publications$/i,
    references: /^references$/i
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

    if (!isSectionHeader) {
      sections[currentSection].push(line.trim());
    }
  });

  return sections;
}

function analyzeWorkExperience(experienceText) {
  if (!experienceText || experienceText.length === 0) {
    return {
      actionVerbCheck: [],
      quantifiableCheck: []
    };
  }

  const actionVerbs = ["achieved", "accelerated", "accomplished", "acquired", "adapted", "administered", "advised", "advocated", "analyzed", "authored", "automated", "balanced", "budgeted", "built", "calculated", "centralized", "chaired", "clarified", "collaborated", "conceived", "conceptualized", "conducted", "consolidated", "constructed", "consulted", "converted", "coordinated", "counseled", "created", "cultivated", "cut", "decreased", "defined", "delegated", "delivered", "demonstrated", "designed", "developed", "devised", "directed", "discovered", "doubled", "drove", "edited", "eliminated", "enabled", "encouraged", "engineered", "enhanced", "ensured", "established", "evaluated", "executed", "expanded", "expedited", "explained", "facilitated", "forecasted", "formulated", "founded", "generated", "governed", "guided", "halved", "headed", "identified", "implemented", "improved", "incorporated", "increased", "initiated", "inspired", "instituted", "instructed", "integrated", "interpreted", "introduced", "invented", "launched", "led", "lectured", "licensed", "lobbied", "maintained", "managed", "marketed", "mastered", "mentored", "merged", "modernized", "motivated", "navigated", "negotiated", "operated", "orchestrated", "organized", "overhauled", "oversaw", "partnered", "perfected", "performed", "pioneered", "planned", "predicted", "prepared", "presented", "presided", "prioritized", "produced", "programmed", "promoted", "proposed", "proved", "provided", "published", "quadrupled", "quantified", "raised", "ran", "ranked", "rated", "received", "recommended", "reconciled", "recruited", "redesigned", "reduced", "refined", "regained", "rehabilitated", "reinforced", "rejuvenated", "related", "remodeled", "reorganized", "repaired", "replaced", "reported", "represented", "researched", "resolved", "responded", "restored", "restructured", "retrieved", "revamped", "revitalized", "revolutionized", "saved", "scheduled", "secured", "selected", "served", "serviced", "shaped", "simplified", "slashed", "solidified", "solved", "sparked", "spearheaded", "specified", "spoke", "sponsored", "staffed", "standardized", "steered", "stimulated", "streamlined", "strengthened", "structured", "studied", "submitted", "substituted", "succeeded", "summarized", "supervised", "supported", "surpassed", "surveyed", "synthesized", "systematized", "tabulated", "taught", "tested", "trained", "transcribed", "transformed", "translated", "tripled", "troubleshot", "tutored", "unified", "united", "unraveled", "updated", "upgraded", "utilized", "validated", "verbalized", "verified", "visualized", "won", "wrote"];
  
  const bulletPoints = experienceText.map(line => line.trim()).filter(line => line.length > 0);
  const actionVerbCheck = [];
  const quantifiableCheck = [];

  bulletPoints.forEach(bullet => {
    const firstWord = bullet.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    if (!actionVerbs.includes(firstWord)) {
      actionVerbCheck.push({ bullet: bullet.slice(0, 50), feedback: `Commencez par un verbe d'action` });
    }

    if (!/\d/.test(bullet)) {
      quantifiableCheck.push({ bullet: bullet.slice(0, 50), feedback: "Ajoutez des résultats quantifiables" });
    }
  });

  return {
    actionVerbCheck: actionVerbCheck.slice(0, 5),
    quantifiableCheck: quantifiableCheck.slice(0, 5)
  };
}

function analyzeReadability(text) {
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).length;
  const pages = Math.ceil(words / 250);
  const longSentences = text.split(/[.!?]+/).filter(sentence => sentence.split(/\s+/).length > 25).length;

  const feedback = [];

  if (pages > 2) feedback.push(`CV de ${pages} pages, idéalement 1-2 pages`);
  if (longSentences > 0) feedback.push(`${longSentences} phrase(s) longue(s) > 25 mots`);

  return { pages, longSentences, feedback };
}

function generateJobSuggestions(skills) {
  const jobCategories = {
    "Développeur Full Stack": {
      required: ["JavaScript", "React", "Node.js", "SQL"],
      optional: ["TypeScript", "MongoDB", "AWS", "Git"]
    },
    "Développeur Backend": {
      required: ["Python", "Java", "SQL", "Node.js"],
      optional: ["Django", "Spring", "Microservices", "Docker"]
    },
    "Data Scientist": {
      required: ["Python", "Machine Learning", "SQL"],
      optional: ["TensorFlow", "Pandas", "NumPy", "R"]
    },
    "DevOps Engineer": {
      required: ["AWS", "Docker", "Linux", "CI/CD"],
      optional: ["Kubernetes", "Terraform", "Jenkins", "Ansible"]
    }
  };

  const suggestions = [];
  for (const [title, requirements] of Object.entries(jobCategories)) {
    const requiredMatch = requirements.required.filter(skill => skills.has(skill)).length;
    const optionalMatch = requirements.optional.filter(skill => skills.has(skill)).length;
    const matchScore = requiredMatch * 20 + optionalMatch * 5;
    
    if (matchScore > 20) {
      suggestions.push({
        title,
        matchScore: Math.min(100, matchScore),
        matchingSkills: [...requirements.required, ...requirements.optional]
          .filter(skill => skills.has(skill))
          .slice(0, 8),
        missingSkills: requirements.required
          .filter(skill => !skills.has(skill))
          .slice(0, 5)
      });
    }
  }

  return suggestions.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
}