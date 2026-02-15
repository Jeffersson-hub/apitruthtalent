// api/analyze.js - Version avec extraction améliorée du nom et prénom

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
// LISTE COMPLÈTE DES DIPLÔMES FRANÇAIS
// ============================================
const FRENCH_DIPLOMAS = {
  cap: { keywords: ['CAP', 'Certificat d\'aptitude professionnelle'], niveau: 'CAP', order: 1 },
  bep: { keywords: ['BEP', 'Brevet d\'études professionnelles'], niveau: 'BEP', order: 1 },
  bac: { keywords: ['BAC', 'Baccalauréat', 'Bac'], niveau: 'BAC', order: 2 },
  bacpro: { keywords: ['Bac Pro', 'Baccalauréat professionnel'], niveau: 'BAC Pro', order: 2 },
  bts: { keywords: ['BTS', 'Brevet de technicien supérieur'], niveau: 'BTS', order: 3 },
  dut: { keywords: ['DUT', 'Diplôme universitaire de technologie'], niveau: 'DUT', order: 3 },
  licence: { keywords: ['Licence', 'Bachelor', 'Bac+3'], niveau: 'Licence', order: 4 },
  maitrise: { keywords: ['Maîtrise', 'Maitrise'], niveau: 'Maîtrise', order: 4.5 },
  master: { keywords: ['Master', 'Master 2', 'Master 1', 'Bac+5', 'Diplôme d\'ingénieur', 'Ingénieur'], niveau: 'Master', order: 5 },
  doctorat: { keywords: ['Doctorat', 'PhD', 'Thèse', 'Docteur', 'Bac+8'], niveau: 'Doctorat', order: 6 }
};

// ============================================
// FONCTION AMÉLIORÉE D'EXTRACTION DU NOM ET PRÉNOM
// ============================================

/**
 * Extrait le nom et prénom de façon robuste
 * @param {string} text - Texte complet du CV
 * @returns {Object} - { nom, prenom, nom_complet }
 */
function extractNameFromCV(text) {
  console.log('🔍 Recherche du nom et prénom...');
  
  // Nettoyer le texte pour l'analyse
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && line.length < 100); // Éviter les lignes trop longues
  
  // ============================================
  // STRATÉGIE 1: Chercher dans les 10 premières lignes (en-tête du CV)
  // ============================================
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    
    // Pattern: Prénom Nom (ex: "Jean Dupont" ou "Jean-François Dupont")
    const namePattern1 = line.match(/^([A-Z][a-zéèêëàâîïôöûüç-]+)\s+([A-Z][a-zéèêëàâîïôöûüç]+)$/);
    if (namePattern1) {
      console.log('✅ Pattern 1 trouvé (Prénom Nom):', line);
      return {
        prenom: namePattern1[1],
        nom: namePattern1[2],
        nom_complet: line
      };
    }
    
    // Pattern: Nom Prénom (ex: "DUPONT Jean")
    const namePattern2 = line.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s+([A-Z][a-zéèêëàâîïôöûüç-]+)$/);
    if (namePattern2) {
      console.log('✅ Pattern 2 trouvé (Nom Prénom):', line);
      return {
        nom: namePattern2[1],
        prenom: namePattern2[2],
        nom_complet: line
      };
    }
    
    // Pattern: Nom en majuscules uniquement (ex: "DUPONT JEAN")
    const namePattern3 = line.match(/^([A-Z]{2,}(?:\s+[A-Z]{2,})+)$/);
    if (namePattern3) {
      console.log('✅ Pattern 3 trouvé (tout majuscule):', line);
      const parts = line.split(' ');
      if (parts.length >= 2) {
        return {
          nom: parts[0],
          prenom: parts.slice(1).join(' '),
          nom_complet: line
        };
      }
    }
    
    // Pattern: Format avec virgule (ex: "Dupont, Jean")
    const namePattern4 = line.match(/^([A-Za-zéèêëàâîïôöûüç-]+),\s*([A-Za-zéèêëàâîïôöûüç-]+)$/);
    if (namePattern4) {
      console.log('✅ Pattern 4 trouvé (Nom, Prénom):', line);
      return {
        nom: namePattern4[1],
        prenom: namePattern4[2],
        nom_complet: line
      };
    }
  }
  
  // ============================================
  // STRATÉGIE 2: Chercher des patterns dans tout le texte
  // ============================================
  
  // Chercher "Prénom : Jean" ou "Nom : Dupont"
  for (const line of lines.slice(0, 20)) {
    const prenomMatch = line.match(/(?:Prénom|Prenom|First name)[\s:]*([A-Za-zéèêëàâîïôöûüç-]+)/i);
    if (prenomMatch) {
      console.log('✅ Champ "Prénom" trouvé:', prenomMatch[1]);
      return {
        prenom: prenomMatch[1],
        nom: null,
        nom_complet: prenomMatch[1]
      };
    }
    
    const nomMatch = line.match(/(?:Nom|Name|Last name)[\s:]*([A-Za-zéèêëàâîïôöûüç-]+)/i);
    if (nomMatch) {
      console.log('✅ Champ "Nom" trouvé:', nomMatch[1]);
      return {
        nom: nomMatch[1],
        prenom: null,
        nom_complet: nomMatch[1]
      };
    }
  }
  
  // ============================================
  // STRATÉGIE 3: Chercher dans les premières lignes des mots avec majuscules
  // ============================================
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    
    // Compter les mots avec majuscule initiale
    const words = line.split(' ');
    const capitalizedWords = words.filter(w => /^[A-Z][a-zéèêëàâîïôöûüç]+$/.test(w));
    
    // Si on a 2-3 mots avec majuscule, c'est probablement un nom
    if (capitalizedWords.length >= 2 && capitalizedWords.length <= 3 && line.length < 50) {
      console.log('✅ Ligne avec mots capitalisés trouvée:', line);
      
      if (capitalizedWords.length === 2) {
        return {
          prenom: capitalizedWords[0],
          nom: capitalizedWords[1],
          nom_complet: line
        };
      } else if (capitalizedWords.length === 3) {
        return {
          prenom: capitalizedWords[0] + ' ' + capitalizedWords[1],
          nom: capitalizedWords[2],
          nom_complet: line
        };
      }
    }
  }
  
  // ============================================
  // STRATÉGIE 4: Dernier recours - prendre la première ligne non-vide
  // ============================================
  for (const line of lines) {
    if (line.length > 3 && line.length < 50 && !line.includes('@') && !line.includes('http')) {
      const words = line.split(' ');
      if (words.length >= 2) {
        console.log('⚠️ Dernier recours - première ligne significative:', line);
        return {
          prenom: words[0],
          nom: words.slice(1).join(' '),
          nom_complet: line
        };
      }
    }
  }
  
  console.log('⚠️ Aucun nom trouvé');
  return { nom: null, prenom: null, nom_complet: null };
}

/**
 * Extrait le texte brut du fichier
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
    
    if (!inExpSection && /expérience|experience|employment|career|parcours professionnel/i.test(line)) {
      inExpSection = true;
      continue;
    }
    
    if (!inExpSection) continue;
    
    const dateMatch = line.match(/(\d{4})\s*[-–—]\s*(\d{4}|présent|now|current|aujourd'hui)/i);
    if (dateMatch) {
      if (currentExp) experiences.push(currentExp);
      
      currentExp = {
        poste: line.replace(dateMatch[0], '').trim() || 'Poste non spécifié',
        entreprise: null,
        date_debut: dateMatch[1],
        date_fin: dateMatch[2].toLowerCase().match(/présent|now|current|aujourd'hui/i) ? 'présent' : dateMatch[2],
        description: []
      };
    } else if (currentExp) {
      const companyMatch = line.match(/(?:chez|@|at|à)\s+([A-Z][A-Za-z0-9\s\-&]+)/i);
      if (companyMatch && !currentExp.entreprise) {
        currentExp.entreprise = companyMatch[1].trim();
      }
      
      if (line.length > 10 && currentExp.description.join(' ').length < 500) {
        currentExp.description.push(line);
      }
    }
  }
  
  if (currentExp) experiences.push(currentExp);
  return experiences;
}

/**
 * Extrait les formations
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
      const schoolKeywords = ['université', 'école', 'institut', 'campus', 'faculté', 'polytechnique'];
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
 * Extrait le plus haut niveau d'étude
 */
function extractHighestEducationLevel(text, formations) {
  let highestLevel = null;
  let highestOrder = 0;
  
  // Chercher dans les formations
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
  
  // Chercher dans le texte
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
  
  // Chercher les mentions Bac+X
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
    
    // Afficher les premières lignes pour déboguer
    console.log('📄 Premières lignes du CV:\n', rawText.split('\n').slice(0, 5).join('\n'));

    // 3. Extraire les informations
    const nameInfo = extractNameFromCV(rawText);
    console.log('👤 Nom extrait:', nameInfo);
    
    const competences = extractSkills(rawText);
    const experiences = extractExperiences(rawText);
    const formations = extractEducation(rawText);
    const niveau = extractHighestEducationLevel(rawText, formations);
    
    const emails = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = rawText.match(/(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g) || [];
    
    const annees_experience = calculateTotalExperience(experiences);

    // Profil (premières lignes significatives)
    const profil = rawText.split('\n')
      .filter(l => l.trim().length > 20)
      .slice(0, 3)
      .join(' ')
      .substring(0, 500);

    console.log('📊 RÉSUMÉ EXTRACTION:', {
      nom: nameInfo.nom,
      prenom: nameInfo.prenom,
      email: emails[0] || 'non trouvé',
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
        nom: nameInfo.nom,
        prenom: nameInfo.prenom,
        nom_complet: nameInfo.nom_complet,
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
        niveau: niveau,
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

    // Dans la route POST /api/analyze
const atsScore = calculateATSScore(response.candidateInfo, jobDescription);
response.candidateInfo.ats_score = atsScore;

if (atsScore < 75) {
  response.success = false;
  response.message = `Votre CV ne correspond pas suffisamment à l'offre (score : ${atsScore}%). Nous vous invitons à le modifier et à le renvoyer.`;
  response.candidateInfo.statut = 'Rejeté (score < 75%)';
} else {
  response.candidateInfo.statut = 'Accepté';
}

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

/**
 * Calcule le score de pertinence entre le CV et l'offre d'emploi.
 * @param {Object} candidateInfo - Données extraites du CV.
 * @param {string} jobDescription - Description de l'offre d'emploi.
 * @returns {number} - Score entre 0 et 100.
 */
function calculateATSScore(candidateInfo, jobDescription) {
  if (!jobDescription || !candidateInfo) return 0;



  // 1. Extraire les compétences et mots-clés de l'offre d'emploi
  const jobKeywords = extractKeywords(jobDescription);
  const cvKeywords = candidateInfo.competences || [];

  // 2. Calculer le score de correspondance des compétences (50% du score total)
  const skillScore = calculateSkillMatchScore(cvKeywords, jobKeywords);

  // 3. Calculer le score d'expérience (30% du score total)
  const experienceScore = calculateExperienceScore(candidateInfo.experiences, jobDescription);

  // 4. Calculer le score de niveau d'étude (20% du score total)
  const educationScore = calculateEducationScore(candidateInfo.niveau, jobDescription);

  // 5. Score total (pondéré)
  const totalScore = (skillScore * 0.5) + (experienceScore * 0.3) + (educationScore * 0.2);

  return Math.round(totalScore * 100); // Retourne un score entre 0 et 100
}

/**
 * Extrait les mots-clés d'un texte (offre d'emploi ou CV).
 */
function extractKeywords(text) {
  if (!text) return [];
  const tokenizer = new natural.WordTokenizer();
  const words = tokenizer.tokenize(text.toLowerCase());

  // Filtrer les stopwords (mots vides comme "le", "la", "de", etc.)
  const stopwords = new Set(natural.stopwords['fr']);
  return words.filter(word => !stopwords.has(word) && word.length > 2);
}

/**
 * Calcule le score de correspondance des compétences.
 */
function calculateSkillMatchScore(cvSkills, jobSkills) {
  if (!cvSkills.length || !jobSkills.length) return 0;

  const commonSkills = cvSkills.filter(skill =>
    jobSkills.some(jobSkill => skill.includes(jobSkill) || jobSkill.includes(skill))
  );

  return commonSkills.length / jobSkills.length; // Ratio de compétences communes
}

/**
 * Calcule le score d'expérience (ex : nombre d'années requises).
 */
function calculateExperienceScore(experiences, jobDescription) {
  const requiredYears = extractRequiredYears(jobDescription);
  if (!requiredYears) return 1; // Si pas d'exigence, score maximal

  const totalExperience = experiences.reduce((sum, exp) => {
    const startYear = parseInt(exp.date_debut);
    const endYear = exp.date_fin === 'présent' ? new Date().getFullYear() : parseInt(exp.date_fin);
    return sum + (endYear - startYear);
  }, 0);

  return Math.min(totalExperience / requiredYears, 1); // 1 = 100% de l'expérience requise
}

/**
 * Extrait le nombre d'années d'expérience requises dans l'offre.
 */
function extractRequiredYears(jobDescription) {
  const match = jobDescription.match(/(\d+)\s*ans?\s*d['’]?expérience/i);
  return match ? parseInt(match[1]) : 2; // Par défaut : 2 ans si non spécifié
}

/**
 * Calcule le score de niveau d'étude.
 */
function calculateEducationScore(candidateEducationLevel, jobDescription) {
  const requiredLevel = extractRequiredEducationLevel(jobDescription);
  if (!requiredLevel) return 1; // Si pas d'exigence, score maximal

  const candidateLevel = DIPLOMES_HIERARCHIE.find(d => d.nom === candidateEducationLevel)?.niveau || 0;
  const requiredLevelNum = DIPLOMES_HIERARCHIE.find(d => d.nom === requiredLevel)?.niveau || 0;

  return candidateLevel >= requiredLevelNum ? 1 : 0.5; // 1 si niveau suffisant, 0.5 sinon
}

/**
 * Extrait le niveau d'étude requis dans l'offre (ex : "Bac+5").
 */
function extractRequiredEducationLevel(jobDescription) {
  const lowerText = jobDescription.toLowerCase();
  for (const diploma of DIPLOMES_HIERARCHIE) {
    for (const keyword of diploma.motsCles) {
      if (lowerText.includes(keyword)) {
        return diploma.nom;
      }
    }
  }
  return 'Bac+3'; // Par défaut : Bac+3 si non spécifié
}


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});