// ============================================
// API D'ANALYSE DE CV - Version Vercel (CommonJS)
// ============================================

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const natural = require('natural');
const multer = require('multer');

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;
const upload = multer({ storage: multer.memoryStorage() });

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
// HANDLER PRINCIPAL - FORMAT COMMONJS
// ============================================
module.exports = async function handler(req, res) {
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
    
    // 1. EXTRAIRE LE TEXTE
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

    // 2. ANALYSE DES COMPÉTENCES
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

    // 3. ANALYSE TF-IDF
    const tfidf = new TfIdf();
    tfidf.addDocument(cleanText);
    const importantKeywords = [];
    tfidf.listTerms(0).forEach(item => {
      if (item.tfidf > 0.1 && item.term.length > 3) {
        importantKeywords.push(item.term);
      }
    });

    // 4. ANALYSE JOB DESCRIPTION
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

    // 5. INFORMATIONS CANDIDAT
    const candidateInfo = extractCandidateInfo(cleanText);
    
    // 6. SUGGESTIONS D'EMPLOI
    const jobSuggestions = generateJobSuggestions(foundTechnicalSkills);

    // ========================================
    // RÉPONSE FINALE
    // ========================================
    return res.status(200).json({
      success: true,
      wordCount: cleanText.split(/\s+/).length,
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
      jobSuggestions: jobSuggestions
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// ============================================
// FONCTIONS HELPER
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