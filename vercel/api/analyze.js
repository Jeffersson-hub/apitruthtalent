// vercel/api/analyze.js
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const natural = require('natural');
const { createClient } = require('@supabase/supabase-js');

const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

// Initialiser Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Bases de données de compétences
const technicalSkills = new Set([
  "JavaScript", "Python", "Java", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "Go", "Rust",
  "HTML", "CSS", "React", "Angular", "Vue", "Node.js", "Express", "Django", "Flask", "Spring",
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Oracle", "SQLite",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "CI/CD",
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy", "R",
  "Android", "iOS", "React Native", "Flutter",
  "Git", "Linux", "Agile", "Scrum", "REST", "GraphQL", "Microservices"
]);

// Handler principal
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Récupérer le fichier depuis Supabase Storage
    const { filePath, jobDescription } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) throw downloadError;

    const fileBuffer = await file.arrayBuffer();
    const fileName = filePath.split('/').pop();

    // 2. Extraire le texte
    let extractedText = "";
    if (fileName.toLowerCase().endsWith('.pdf')) {
      const data = await pdfParse(Buffer.from(fileBuffer));
      extractedText = data.text;
    } else if (fileName.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      extractedText = result.value;
    } else {
      return res.status(400).json({ error: "Format non supporté. Utilisez PDF ou DOCX." });
    }

    // 3. Nettoyer le texte
    const cleanText = extractedText.replace(/\s+/g, " ").trim();

    // 4. Analyser les compétences
    const tokens = tokenizer.tokenize(cleanText.toLowerCase());
    const foundTechnicalSkills = new Set();
    tokens.forEach(token => {
      technicalSkills.forEach(skill => {
        const skillLower = skill.toLowerCase();
        if (skillLower.includes(token) || token.includes(skillLower)) {
          foundTechnicalSkills.add(skill);
        }
      });
    });

    // 5. Calculer le score ATS
    let skillMatchPercentage = 0;
    let missingSkills = [];
    if (jobDescription) {
      const jdTokens = tokenizer.tokenize(jobDescription.toLowerCase());
      const requiredSkills = new Set();
      jdTokens.forEach(token => {
        technicalSkills.forEach(skill => {
          const skillLower = skill.toLowerCase();
          if (skillLower.includes(token) || token.includes(skillLower)) {
            requiredSkills.add(skill);
          }
        });
      });
      missingSkills = Array.from(requiredSkills).filter(skill => !foundTechnicalSkills.has(skill));
      skillMatchPercentage = requiredSkills.size > 0
        ? Math.round((foundTechnicalSkills.size / requiredSkills.size) * 100)
        : 0;
    }

    // 6. Extraire les infos du candidat
    const candidateInfo = extractCandidateInfo(cleanText);

    // 7. Réponse finale
    return res.status(200).json({
      success: true,
      candidateInfo,
      skills: {
        technical: Array.from(foundTechnicalSkills).slice(0, 20),
        technical_count: foundTechnicalSkills.size,
      },
      ats: {
        score: `${skillMatchPercentage}%`,
        missingKeywords: missingSkills.slice(0, 10),
      },
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Helper: Extraire les infos du candidat
function extractCandidateInfo(text) {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;

  const emailMatch = text.match(emailRegex);
  const phoneMatch = text.match(phoneRegex);

  return {
    email: emailMatch ? emailMatch[0].trim() : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null,
  };
}
