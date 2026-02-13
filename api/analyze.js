import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

const app = express();
app.use(express.json());

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
  "Python", "Go", "Java", "JavaScript", "Node.js", "React"
]);

app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath is required' });

    // Appeler le script resume-analyzer
    const { stdout, stderr } = await execAsync(
      `node ${path.join(__dirname, '../resume-analyzer/extract-resume-text/index.js')} '${JSON.stringify({ filePath, jobDescription })}'`,
      { cwd: path.join(__dirname, '../resume-analyzer/extract-resume-text') }
    );

    if (stderr) throw new Error(stderr);
    const analysis = JSON.parse(stdout);

    // 1. Télécharger le CV depuis Supabase Storage
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) throw downloadError;

    // 2. Extraire le texte
    const fileBuffer = await file.arrayBuffer();
    let extractedText = "";

    if (filePath.endsWith('.pdf')) {
      const pdfData = await pdfParse(Buffer.from(fileBuffer));
      extractedText = pdfData.text;
    } else if (filePath.endsWith('.docx')) {
      const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      extractedText = docxData.value;
    } else {
      return res.status(400).json({ error: "Format non supporté. Utilisez PDF ou DOCX." });
    }

    // 3. Nettoyer le texte
    const cleanText = extractedText.replace(/\s+/g, " ").trim();

    // 4. Extraire les compétences
    const tokens = tokenizer.tokenize(cleanText.toLowerCase());
    const foundSkills = new Set();

    tokens.forEach(token => {
      technicalSkills.forEach(skill => {
        if (skill.toLowerCase().includes(token)) {
          foundSkills.add(skill);
        }
      });
    });

    // 5. Extraire les infos du candidat
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/;

    const emailMatch = cleanText.match(emailRegex);
    const phoneMatch = cleanText.match(phoneRegex);

    // 6. Calculer le score ATS
    const jdTokens = tokenizer.tokenize(jobDescription.toLowerCase());
    const requiredSkills = new Set();

    jdTokens.forEach(token => {
      technicalSkills.forEach(skill => {
        if (skill.toLowerCase().includes(token)) {
          requiredSkills.add(skill);
        }
      });
    });

    const missingSkills = Array.from(requiredSkills).filter(skill => !foundSkills.has(skill));
    const matchPercentage = requiredSkills.size > 0
      ? Math.round((foundSkills.size / requiredSkills.size) * 100)
      : 100;

    // 7. Préparer la réponse
    res.status(200).json({
      success: true,
      candidateInfo: {
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[0] : null,
        skills: Array.from(foundSkills),
        missingSkills: missingSkills,
        matchPercentage: matchPercentage,
        textPreview: cleanText.substring(0, 500)
      }
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      error: error.message,
      details: "Impossible d'analyser le CV. Vérifiez le chemin du fichier et le format."
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
