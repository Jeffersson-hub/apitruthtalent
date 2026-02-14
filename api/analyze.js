// api/analyze.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '50mb' })); // Augmenter la limite pour les fichiers

const { WordTokenizer } = natural;
const tokenizer = new WordTokenizer();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Liste de compétences techniques
const technicalSkills = new Set([
  "Kubernetes", "Docker", "DevOps", "AWS", "Azure", "GCP",
  "Terraform", "Ansible", "Jenkins", "CI/CD", "Linux", "Bash",
  "Python", "Go", "Java", "JavaScript", "Node.js", "React",
  "Angular", "Vue", "MongoDB", "PostgreSQL", "MySQL", "Redis",
  "Git", "GitHub", "GitLab", "Jira", "Confluence", "Agile",
  "Scrum", "Kanban", "REST", "GraphQL", "Django", "Flask",
  "Express", "NestJS", "TypeScript", "PHP", "Laravel", "Symfony",
  "Ruby", "Rails", "C#", ".NET", "C++", "C", "Rust", "Swift",
  "Kotlin", "Flutter", "React Native", "TensorFlow", "PyTorch",
  "Scikit-learn", "Pandas", "NumPy", "Tableau", "Power BI"
]);

app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    
    console.log('📥 Requête reçue:', { filePath, jobDescription: jobDescription?.substring(0, 50) + '...' });
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }

    // 1. Télécharger le CV depuis Supabase Storage
    console.log('📥 Téléchargement du fichier depuis Supabase:', filePath);
    
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      console.error('❌ Erreur téléchargement Supabase:', downloadError);
      throw new Error(`Erreur téléchargement: ${downloadError.message}`);
    }

    console.log('✅ Fichier téléchargé, taille:', file.size, 'bytes');

    // 2. Extraire le texte selon le type de fichier
    const fileBuffer = await file.arrayBuffer();
    let extractedText = "";

    if (filePath.toLowerCase().endsWith('.pdf')) {
      console.log('📄 Analyse PDF...');
      const pdfData = await pdfParse(Buffer.from(fileBuffer));
      extractedText = pdfData.text;
    } else if (filePath.toLowerCase().endsWith('.docx')) {
      console.log('📄 Analyse DOCX...');
      const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      extractedText = docxData.value;
    } else {
      return res.status(400).json({ 
        error: "Format non supporté", 
        details: "Utilisez PDF ou DOCX uniquement." 
      });
    }

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("Aucun texte extrait du fichier");
    }

    console.log('✅ Texte extrait, longueur:', extractedText.length, 'caractères');

    // 3. Nettoyer le texte
    const cleanText = extractedText.replace(/\s+/g, " ").trim();

    // 4. Extraire les compétences
    const tokens = tokenizer.tokenize(cleanText.toLowerCase());
    const foundSkills = new Set();

    tokens.forEach(token => {
      technicalSkills.forEach(skill => {
        if (token.includes(skill.toLowerCase()) || 
            skill.toLowerCase().includes(token)) {
          foundSkills.add(skill);
        }
      });
    });

    // 5. Extraire les infos du candidat
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g;
    const nameRegex = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m;

    const emailMatch = cleanText.match(emailRegex);
    const phoneMatch = cleanText.match(phoneRegex);
    const nameMatch = cleanText.match(nameRegex);

    // 6. Calculer le score ATS si jobDescription fourni
    let matchPercentage = 100;
    let missingSkills = [];
    let requiredSkills = [];

    if (jobDescription && jobDescription.trim()) {
      console.log('📊 Calcul du score ATS...');
      const jdTokens = tokenizer.tokenize(jobDescription.toLowerCase());
      requiredSkills = [];

      jdTokens.forEach(token => {
        technicalSkills.forEach(skill => {
          if (token.includes(skill.toLowerCase())) {
            requiredSkills.push(skill);
          }
        });
      });

      requiredSkills = [...new Set(requiredSkills)]; // Dédupliquer
      missingSkills = requiredSkills.filter(skill => !foundSkills.has(skill));
      
      matchPercentage = requiredSkills.length > 0
        ? Math.round(((requiredSkills.length - missingSkills.length) / requiredSkills.length) * 100)
        : 100;

      console.log('📊 Score calculé:', matchPercentage + '%');
    }

    // 7. Préparer la réponse
    const response = {
      success: true,
      candidateInfo: {
        name: nameMatch ? nameMatch[0].trim() : null,
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0] : null,
        skills: Array.from(foundSkills).sort(),
        missingSkills: missingSkills.sort(),
        requiredSkills: requiredSkills.sort(),
        matchPercentage: matchPercentage,
        textPreview: cleanText.substring(0, 500) + '...'
      }
    };

    console.log('✅ Analyse terminée avec succès');
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Erreur analyse:', error);
    res.status(500).json({
      error: error.message,
      details: "Impossible d'analyser le CV. Vérifiez le chemin du fichier et le format."
    });
  }
});

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'API d\'analyse de CV opérationnelle' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Endpoint: http://localhost:${PORT}/api/analyze`);
});