// api/analyze.js - Version corrigée

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// LISTE COMPLÈTE DES DIPLÔMES FRANÇAIS (du CAP au Doctorat)
// ============================================
const FRENCH_DIPLOMAS = {
  // Niveau CAP/BEP (Niveau 3)
  cap: {
    keywords: ['CAP', 'Certificat d\'aptitude professionnelle'],
    niveau: 'CAP',
    order: 1
  },
  bep: {
    keywords: ['BEP', 'Brevet d\'études professionnelles'],
    niveau: 'BEP',
    order: 1
  },
  
  // Niveau Bac (Niveau 4)
  bac: {
    keywords: ['BAC', 'Baccalauréat', 'Bac', 'Bac général', 'Bac technologique', 'Bac professionnel'],
    niveau: 'BAC',
    order: 2
  },
  bacpro: {
    keywords: ['Bac Pro', 'Baccalauréat professionnel'],
    niveau: 'BAC Pro',
    order: 2
  },
  
  // Niveau Bac+2 (Niveau 5)
  bts: {
    keywords: ['BTS', 'Brevet de technicien supérieur'],
    niveau: 'BTS',
    order: 3
  },
  dut: {
    keywords: ['DUT', 'Diplôme universitaire de technologie'],
    niveau: 'DUT',
    order: 3
  },
  deug: {
    keywords: ['DEUG', 'Diplôme d\'études universitaires générales'],
    niveau: 'DEUG',
    order: 3
  },
  
  // Niveau Bac+3 (Licence - Niveau 6)
  licence: {
    keywords: ['Licence', 'Licence professionnelle', 'Bachelor', 'Bac+3'],
    niveau: 'Licence',
    order: 4
  },
  licencepro: {
    keywords: ['Licence pro', 'Licence professionnelle'],
    niveau: 'Licence Pro',
    order: 4
  },
  
  // Niveau Bac+4 (Niveau 6 aussi, mais intermédiaire)
  maitrise: {
    keywords: ['Maîtrise', 'Maitrise'],
    niveau: 'Maîtrise',
    order: 4.5
  },
  
  // Niveau Bac+5 (Master - Niveau 7)
  master: {
    keywords: ['Master', 'Master 2', 'Master 1', 'Master recherche', 'Master pro', 'Bac+5', 'Diplôme d\'ingénieur', 'Ingénieur'],
    niveau: 'Master',
    order: 5
  },
  master2: {
    keywords: ['Master 2', 'Master II'],
    niveau: 'Master 2',
    order: 5
  },
  master1: {
    keywords: ['Master 1', 'Master I'],
    niveau: 'Master 1',
    order: 4.7
  },
  ingenieur: {
    keywords: ['Ingénieur', 'Diplôme d\'ingénieur', 'École d\'ingénieurs'],
    niveau: 'Ingénieur',
    order: 5
  },
  commerce: {
    keywords: ['École de commerce', 'ESC', 'HEC', 'ESSEC', 'EDHEC', 'EM Lyon'],
    niveau: 'Master (École de commerce)',
    order: 5
  },
  sciencepo: {
    keywords: ['Sciences Po', 'IEP', 'Institut d\'études politiques'],
    niveau: 'Master (Sciences Po)',
    order: 5
  },
  
  // Niveau Bac+8 (Doctorat - Niveau 8)
  doctorat: {
    keywords: ['Doctorat', 'PhD', 'Thèse', 'Docteur', 'Doctorate', 'Bac+8'],
    niveau: 'Doctorat',
    order: 6
  },
  
  // Diplômes spécifiques
  medecine: {
    keywords: ['Médecine', 'Doctorat en médecine', 'DES', 'Internat'],
    niveau: 'Doctorat (Médecine)',
    order: 6
  },
  pharmacie: {
    keywords: ['Pharmacie', 'Doctorat en pharmacie'],
    niveau: 'Doctorat (Pharmacie)',
    order: 6
  },
  architecture: {
    keywords: ['Architecture', 'Architecte', 'DPLG'],
    niveau: 'Master (Architecture)',
    order: 5
  },
  
  // Diplômes internationaux (reconnus en France)
  bachelor: {
    keywords: ['Bachelor\'s degree', 'Bachelor of Science', 'BSc', 'Bachelor of Arts', 'BA'],
    niveau: 'Bachelor (international)',
    order: 4
  },
  master_intl: {
    keywords: ['Master\'s degree', 'Master of Science', 'MSc', 'Master of Arts', 'MA', 'MBA'],
    niveau: 'Master (international)',
    order: 5
  },
  phd: {
    keywords: ['PhD', 'Doctor of Philosophy'],
    niveau: 'Doctorat (international)',
    order: 6
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
    let text = '';
    
    if (fileType === 'pdf') {
      const pdfData = await pdfParse(Buffer.from(fileBuffer));
      text = pdfData.text;
    } else if (fileType === 'docx') {
      const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      text = docxData.value;
    } else {
      throw new Error('Format de fichier non supporté');
    }
    
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
      
  } catch (error) {
    console.error('Erreur extraction texte:', error);
    throw error;
  }
}

/**
 * Extrait le nom complet
 */
function extractFullName(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 2);
  
  // Pattern 1: Nom en majuscules
  for (const line of lines.slice(0, 5)) {
    if (line === line.toUpperCase() && line.length > 5 && line.length < 40) {
      return line.trim();
    }
  }
  
  // Pattern 2: Première ligne avec format "Prénom Nom"
  const firstLine = lines[0];
  if (firstLine && firstLine.split(' ').length >= 2) {
    const words = firstLine.split(' ');
    if (words.every(w => /^[A-Z][a-zéèêëàâîïôöûüç]+$/.test(w))) {
      return firstLine;
    }
  }
  
  return null;
}

/**
 * Extrait les compétences
 */
function extractSkills(text) {
  const TECHNICAL_SKILLS = [
    "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins",
    "CI/CD", "Ansible", "Python", "Java", "JavaScript", "TypeScript", "Go",
    "React", "Angular", "Vue", "Node.js", "Django", "Flask", "Spring",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "ERP", "SAP", "Oracle ERP",
    "Microsoft Dynamics", "Odoo", "Salesforce", "Gestion de projet",
    "Chef de projet", "PMP", "Agile", "Scrum", "Kanban", "Jira", "Confluence"
  ];
  
  const foundSkills = new Set();
  const textLower = text.toLowerCase();
  
  for (const skill of TECHNICAL_SKILLS) {
    if (textLower.includes(skill.toLowerCase())) {
      foundSkills.add(skill);
    }
  }
  
  return Array.from(foundSkills);
}

/**
 * Extrait les expériences professionnelles
 */
function extractExperiences(text) {
  const experiences = [];
  const lines = text.split('\n');
  let currentExp = null;
  let inExpSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (!inExpSection && /expérience|experience|employment|career/i.test(line)) {
      inExpSection = true;
      continue;
    }
    
    if (!inExpSection) continue;
    
    const dateMatch = line.match(/(\d{4})\s*[-–—]\s*(\d{4}|présent|now|current)/i);
    if (dateMatch) {
      if (currentExp) experiences.push(currentExp);
      
      currentExp = {
        poste: line,
        entreprise: null,
        date_debut: dateMatch[1],
        date_fin: dateMatch[2],
        description: []
      };
    } else if (currentExp) {
      const companyMatch = line.match(/(?:chez|@|at)\s+([A-Z][A-Za-z0-9\s\-&]+)/i);
      if (companyMatch && !currentExp.entreprise) {
        currentExp.entreprise = companyMatch[1].trim();
      }
      
      if (line.length > 10) {
        currentExp.description.push(line);
      }
    }
  }
  
  if (currentExp) experiences.push(currentExp);
  return experiences;
}

/**
 * Extrait les formations (VERSION AMÉLIORÉE)
 */
function extractEducation(text) {
  const education = [];
  const lines = text.split('\n');
  let inEduSection = false;
  let currentEdu = null;
  
  const educationSectionKeywords = [
    'formation', 'formations', 'diplôme', 'diplômes', 'cursus',
    'éducation', 'parcours académique', 'études', 'diplômé'
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (!inEduSection) {
      const isEducationSection = educationSectionKeywords.some(keyword => 
        line.toLowerCase().includes(keyword) && line.length < 60
      );
      
      if (isEducationSection) {
        inEduSection = true;
        continue;
      }
    }
    
    if (!inEduSection) continue;
    
    const hasYear = /\b(19|20)\d{2}\b/.test(line);
    const hasDiploma = Object.values(FRENCH_DIPLOMAS).some(diploma =>
      diploma.keywords.some(keyword => 
        line.toLowerCase().includes(keyword.toLowerCase())
      )
    );
    
    if ((hasYear || hasDiploma) && line.length > 5) {
      if (currentEdu) {
        education.push(currentEdu);
      }
      
      currentEdu = {
        diplome: line,
        etablissement: null,
        annee: hasYear ? line.match(/\b(19|20)\d{2}\b/)[0] : null
      };
    } else if (currentEdu && !currentEdu.etablissement) {
      const schoolKeywords = ['université', 'école', 'institut', 'campus', 'faculté'];
      if (schoolKeywords.some(keyword => line.toLowerCase().includes(keyword))) {
        currentEdu.etablissement = line;
      }
    }
  }
  
  if (currentEdu) {
    education.push(currentEdu);
  }
  
  return education;
}

/**
 * Extrait le plus haut niveau d'étude (NOUVELLE FONCTION)
 */
function extractHighestEducationLevel(text, formations) {
  console.log('🔍 Recherche du niveau d\'étude...');
  
  let highestLevel = null;
  let highestOrder = 0;
  
  // 1. Chercher dans les formations extraites
  if (formations && formations.length > 0) {
    for (const formation of formations) {
      const formationText = JSON.stringify(formation).toLowerCase();
      
      for (const [key, diploma] of Object.entries(FRENCH_DIPLOMAS)) {
        for (const keyword of diploma.keywords) {
          if (formationText.includes(keyword.toLowerCase())) {
            if (diploma.order > highestOrder) {
              highestOrder = diploma.order;
              highestLevel = diploma.niveau;
            }
            break;
          }
        }
      }
    }
  }
  
  // 2. Si rien trouvé, chercher dans tout le texte
  if (!highestLevel) {
    const textLower = text.toLowerCase();
    const diplomasByOrder = Object.entries(FRENCH_DIPLOMAS)
      .sort((a, b) => b[1].order - a[1].order);
    
    for (const [key, diploma] of diplomasByOrder) {
      for (const keyword of diploma.keywords) {
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(textLower)) {
          highestLevel = diploma.niveau;
          highestOrder = diploma.order;
          break;
        }
      }
      if (highestLevel) break;
    }
  }
  
  // 3. Chercher les mentions "Bac+X"
  if (!highestLevel) {
    const bacPlusRegex = /bac[+\s]*(\d+)/i;
    const match = text.match(bacPlusRegex);
    if (match) {
      const years = parseInt(match[1]);
      if (years >= 8) highestLevel = 'Doctorat (Bac+8)';
      else if (years >= 5) highestLevel = 'Master (Bac+5)';
      else if (years >= 3) highestLevel = 'Licence (Bac+3)';
      else if (years >= 2) highestLevel = 'BTS/DUT (Bac+2)';
      else highestLevel = `Bac+${years}`;
    }
  }
  
  console.log('🎓 Niveau d\'étude final:', highestLevel || 'Non spécifié');
  return highestLevel || 'Non spécifié';
}

/**
 * Calcule les années d'expérience
 */
function calculateTotalExperience(experiences) {
  let totalYears = 0;
  const currentYear = new Date().getFullYear();
  
  for (const exp of experiences) {
    const debut = parseInt(exp.date_debut);
    let fin = exp.date_fin === 'présent' ? currentYear : parseInt(exp.date_fin);
    
    if (!isNaN(debut) && !isNaN(fin) && fin >= debut) {
      totalYears += (fin - debut);
    }
  }
  
  return Math.round(totalYears * 10) / 10;
}

/**
 * Calcule le hash du fichier
 */
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ============================================
// ROUTE PRINCIPALE
// ============================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    
    console.log('📥 Requête reçue:', { filePath });

    if (!filePath) {
      return res.status(400).json({ error: 'filePath requis' });
    }

    // 1. Télécharger le fichier
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

    console.log('✅ Fichier téléchargé, type:', fileType);

    // 2. Extraire le texte
    const rawText = await extractTextFromFile(fileBuffer, fileType);
    console.log('✅ Texte extrait, longueur:', rawText.length);

    // 3. Extraire TOUTES les informations dans le bon ordre
    const fullName = extractFullName(rawText);
    const competences = extractSkills(rawText);
    const experiences = extractExperiences(rawText);
    const formations = extractEducation(rawText);  // D'abord les formations
    const niveau = extractHighestEducationLevel(rawText, formations);  // Ensuite le niveau (utilise formations)
    
    const emails = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = rawText.match(/(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g) || [];
    
    const annees_experience = calculateTotalExperience(experiences);

    // Séparation nom/prénom
    let nom = null, prenom = null;
    if (fullName) {
      const parts = fullName.split(' ');
      prenom = parts[0];
      nom = parts.slice(1).join(' ');
    }

    // Profil (premières lignes)
    const profil = rawText.split('\n').slice(0, 3).join(' ').substring(0, 300);

    console.log('📊 RÉSUMÉ EXTRACTION:', {
      nom, prenom,
      email: emails[0],
      competences: competences.length,
      experiences: experiences.length,
      formations: formations.length,
      niveau: niveau,
      annees_experience: annees_experience
    });

    // 4. Construire la réponse
    const response = {
      success: true,
      candidateInfo: {
        // Informations personnelles
        nom: nom,
        prenom: prenom,
        nom_complet: fullName,
        email: emails[0] || null,
        telephone: phones[0] || null,
        adresse: null,
        
        // Profil professionnel
        profil: profil,
        metiers: competences.includes('ERP') ? 'Chef de Projet ERP' : null,
        postes: experiences.map(e => e.poste).filter(Boolean),
        entreprise: experiences[0]?.entreprise || null,
        
        // Compétences et expériences
        competences: competences,
        experiences: experiences,
        formations: formations,
        linkedin: null,
        lien: null,
        
        // Niveau et expérience
        niveau: niveau,  // Utilisation de la variable niveau calculée
        annees_experience: annees_experience,
        
        // Métadonnées
        cv_filename: filePath.split('/').pop(),
        cv_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/truthtalent/${filePath}`,
        file_hash: fileHash,
        raw_text: rawText.substring(0, 5000),
        
        // Statistiques
        confidence_score: 0.85
      }
    };

    console.log('✅ Analyse terminée avec succès');
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Erreur analyse:', error);
    res.status(500).json({
      error: error.message,
      details: "Erreur lors de l'analyse du CV"
    });
  }
});

// Route de santé
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
});