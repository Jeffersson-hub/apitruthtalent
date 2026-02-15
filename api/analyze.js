// api/analyze.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '50mb' }));

const { WordTokenizer, SentenceTokenizer } = natural;
const wordTokenizer = new WordTokenizer();
const sentenceTokenizer = new SentenceTokenizer();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// CONFIGURATION DES MOTS-CLÉS ET PATTERNS
// ============================================

// Patterns pour l'extraction d'informations
const PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g,
  linkedin: /linkedin\.com\/in\/[A-Za-z0-9_-]+/gi,
  date: /\b(19|20)\d{2}\b/g,
  // Patterns pour les sections de CV
  sections: {
    experience: /(expérience|expériences|expériences professionnelles|work experience|employment|career)/i,
    education: /(formation|formations|éducation|education|diplôme|degree)/i,
    skills: /(compétences|skills|technologies|outils|tools)/i,
    languages: /(langues|languages|langues étrangères)/i,
    profile: /(profil|profile|summary|résumé|about)/i
  }
};

// ============================================
// FONCTIONS D'EXTRACTION
// ============================================

/**
 * Extrait le texte brut du fichier (PDF ou DOCX)
 */
async function extractTextFromFile(fileBuffer, fileType) {
  try {
    if (fileType === 'pdf') {
      const pdfData = await pdfParse(Buffer.from(fileBuffer));
      return pdfData.text;
    } else if (fileType === 'docx') {
      const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      return docxData.value;
    } else {
      throw new Error('Format de fichier non supporté');
    }
  } catch (error) {
    console.error('Erreur extraction texte:', error);
    throw error;
  }
}

/**
 * Nettoie et normalise le texte
 */
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')           // Remplacer les espaces multiples
    .replace(/[^\w\s@.-]/g, ' ')     // Garder seulement les caractères utiles
    .replace(/\n+/g, ' \n ')         // Normaliser les sauts de ligne
    .trim();
}

/**
 * Calcule le hash du fichier pour éviter les doublons
 */
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Extrait le nom et prénom du texte
 */
function extractName(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const namePattern = /^([A-Z][a-zéèêëàâîïôöûüç]+(?:\s+[A-Z][a-zéèêëàâîïôöûüç-]+){1,3})$/;

  for (const line of lines.slice(0, 5)) {
    const nameMatch = line.match(namePattern);
    if (nameMatch) {
      const nameParts = nameMatch[1].split(' ');
      if (nameParts.length >= 2) {
        return {
          prenom: nameParts[0],
          nom: nameParts.slice(1).join(' ')
        };
      }
    }
  }

  return { prenom: null, nom: null };
}


/**
 * Extrait les sections du CV
 */
function extractSections(text) {
  const lines = text.split('\n');
  const sections = {};
  let currentSection = 'header';
  let currentContent = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) continue;

    // Détecter les sections
    let sectionFound = false;
    for (const [section, pattern] of Object.entries(PATTERNS.sections)) {
      if (pattern.test(trimmedLine) && trimmedLine.length < 50) {
        if (currentContent.length > 0) {
          sections[currentSection] = currentContent.join('\n');
        }
        currentSection = section;
        currentContent = [];
        sectionFound = true;
        break;
      }
    }

    if (!sectionFound) {
      currentContent.push(trimmedLine);
    }
  }

  // Ajouter la dernière section
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n');
  }

  return sections;
}

/**
 * Extrait les expériences professionnelles
 */
function extractExperiences(sections) {
  const experiences = [];
  const expText = sections.experience || '';
  
  if (!expText) return experiences;

  // Pattern pour détecter une expérience (poste, entreprise, dates)
  const expBlocks = expText.split(/\n\s*\n/); // Séparer par doubles sauts de ligne
  
  for (const block of expBlocks) {
    const lines = block.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) continue;

    const exp = {
      poste: null,
      entreprise: null,
      date_debut: null,
      date_fin: null,
      description: []
    };

    // La première ligne contient souvent le poste
    exp.poste = lines[0];
    
    // Chercher les dates
    for (const line of lines) {
      const dates = line.match(/\b(19|20)\d{2}\b/g);
      if (dates && dates.length >= 2) {
        exp.date_debut = dates[0];
        exp.date_fin = dates[1];
      } else if (dates && dates.length === 1) {
        if (line.includes('présent') || line.includes('now') || line.includes('actuel')) {
          exp.date_debut = dates[0];
          exp.date_fin = 'présent';
        }
      }
    }

    // Le reste est la description
    exp.description = lines.slice(1).join(' ').substring(0, 200);
    
    experiences.push(exp);
  }

  return experiences;
}

/**
 * Extrait les formations
 */
function extractEducation(sections) {
  const education = [];
  const eduText = sections.education || '';
  
  if (!eduText) return education;

  const eduBlocks = eduText.split(/\n\s*\n/);
  
  for (const block of eduBlocks) {
    const lines = block.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 1) continue;

    const edu = {
      diplome: lines[0],
      etablissement: lines[1] || null,
      annee: null
    };

    // Chercher l'année
    for (const line of lines) {
      const year = line.match(/\b(19|20)\d{2}\b/);
      if (year) {
        edu.annee = year[0];
        break;
      }
    }

    education.push(edu);
  }

  return education;
}

/**
 * Extrait les compétences
 */
function extractSkills(sections) {
  const skillsText = sections.skills || '';
  if (!skillsText) return [];

  // Liste de compétences courantes (à enrichir selon votre domaine)
  const commonSkills = [
    // Cloud & DevOps
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins',
    'CI/CD', 'Ansible', 'Linux', 'Bash',
    
    // Langages
    'Python', 'Java', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'C#', 'PHP',
    'Ruby', 'Swift', 'Kotlin',
    
    // Frameworks
    'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'Spring',
    'Laravel', 'Symfony', '.NET', 'Express',
    
    // Bases de données
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
    
    // Outils
    'Git', 'GitHub', 'GitLab', 'Jira', 'Confluence',
    
    // Méthodologies
    'Agile', 'Scrum', 'Kanban', 'DevOps',
    
    // ERP (spécifique à votre domaine)
    'ERP', 'SAP', 'Oracle', 'Microsoft Dynamics', 'Odoo'
  ];

  const foundSkills = [];
  const words = wordTokenizer.tokenize(skillsText.toLowerCase());

  for (const skill of commonSkills) {
    if (words.some(word => word.includes(skill.toLowerCase()))) {
      foundSkills.push(skill);
    }
  }

  return [...new Set(foundSkills)]; // Dédupliquer
}

/**
 * Calcule les années d'expérience totales
 */
function calculateTotalExperience(experiences) {
  let totalYears = 0;
  
  for (const exp of experiences) {
    if (exp.date_debut && exp.date_fin) {
      const debut = parseInt(exp.date_debut);
      const fin = exp.date_fin === 'présent' ? new Date().getFullYear() : parseInt(exp.date_fin);
      if (!isNaN(debut) && !isNaN(fin)) {
        totalYears += (fin - debut);
      }
    }
  }
  
  return totalYears;
}

// ============================================
// ROUTE PRINCIPALE D'ANALYSE
// ============================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    
    console.log('📥 Requête reçue:', { filePath, jobDescription: jobDescription?.substring(0, 50) });

    if (!filePath) {
      return res.status(400).json({ error: 'filePath requis' });
    }

    // 1. Télécharger le fichier depuis Supabase
    console.log('📥 Téléchargement depuis Supabase...');
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Erreur téléchargement: ${downloadError.message}`);
    }

    const fileBuffer = await file.arrayBuffer();
    const fileType = filePath.split('.').pop().toLowerCase();
    const fileHash = calculateFileHash(Buffer.from(fileBuffer));

    console.log('✅ Fichier téléchargé, type:', fileType, 'taille:', file.size);

    // 2. Extraire le texte du CV
    const rawText = await extractTextFromFile(fileBuffer, fileType);
    const cleanTextContent = cleanText(rawText);

    console.log('✅ Texte extrait, longueur:', cleanTextContent.length);

    // 3. Extraire les sections
    const sections = extractSections(cleanTextContent);

    // 4. Extraire les informations personnelles
    const emails = cleanTextContent.match(PATTERNS.email) || [];
    const phones = cleanTextContent.match(PATTERNS.phone) || [];
    const linkedinUrls = cleanTextContent.match(PATTERNS.linkedin) || [];

    // 5. Extraire le nom
    const fullName = extractName(cleanTextContent);
    let nom = null;
    let prenom = null;
    
    if (fullName) {
      const nameParts = fullName.split(' ');
      prenom = nameParts[0];
      nom = nameParts.slice(1).join(' ');
    }

    // 6. Extraire les expériences et formations
    const experiences = extractExperiences(sections);
    const formations = extractEducation(sections);
    const competences = extractSkills(sections);
    const annees_experience = calculateTotalExperience(experiences);

    // 7. Extraire le profil (résumé)
    let profil = null;
    if (sections.profile) {
      profil = sections.profile.substring(0, 500);
    } else {
      // Prendre les premières lignes comme profil
      profil = cleanTextContent.split('\n').slice(0, 3).join(' ').substring(0, 500);
    }

    // 8. Construire la réponse structurée
    const response = {
      success: true,
      candidateInfo: {
        // Informations personnelles
        nom: nom,
        prenom: prenom,
        nom_complet: fullName,
        email: emails[0] || null,
        telephone: phones[0] || null,
        adresse: null, // À implémenter si besoin
        
        // Profil professionnel
        profil: profil,
        metiers: competences.includes('ERP') ? 'Chef de Projet ERP' : null,
        postes: experiences.map(e => e.poste).filter(Boolean),
        entreprise: experiences[0]?.entreprise || null,
        
        // Compétences et expériences
        competences: competences,
        experiences: experiences,
        formations: formations,
        linkedin: linkedinUrls[0] || null,
        lien: null,
        
        // Niveau et expérience
        niveau: formations[0]?.diplome || null,
        annees_experience: annees_experience,
        
        // Métadonnées du CV
        cv_filename: filePath.split('/').pop(),
        cv_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/truthtalent/${filePath}`,
        file_hash: fileHash,
        raw_text: cleanTextContent.substring(0, 5000), // Limiter pour la DB
        
        // Statistiques
        confidence_score: 0.85,
      }
    };

    console.log('✅ Analyse terminée avec succès');
    console.log('📊 Données extraites:', {
      nom: response.candidateInfo.nom,
      prenom: response.candidateInfo.prenom,
      email: response.candidateInfo.email,
      competences: response.candidateInfo.competences.length,
      experiences: response.candidateInfo.experiences.length,
      formations: response.candidateInfo.formations.length,
      annees_experience: response.candidateInfo.annees_experience
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Erreur analyse:', error);
    res.status(500).json({
      error: error.message,
      details: "Erreur lors de l'analyse du CV"
    });
  }
});

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API d\'analyse de CV opérationnelle',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Endpoint: http://localhost:${PORT}/api/analyze`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📝 Endpoint: https://apitruthtalent.vercel.app/api/analyze`);
  console.log(`🔍 Health check: https://apitruthtalent.vercel.app/api/health`);
});