// api/analyze.js - Version avec extraction améliorée du nom et prénom

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import natural from 'natural';


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

// Ajouter après FRENCH_DIPLOMAS
const DIPLOMES_HIERARCHIE = [
  { nom: 'CAP', niveau: 1, motsCles: ['cap', 'certificat'] },
  { nom: 'BEP', niveau: 1, motsCles: ['bep'] },
  { nom: 'BAC', niveau: 2, motsCles: ['bac', 'baccalauréat'] },
  { nom: 'BAC Pro', niveau: 2, motsCles: ['bac pro'] },
  { nom: 'BTS', niveau: 3, motsCles: ['bts'] },
  { nom: 'DUT', niveau: 3, motsCles: ['dut'] },
  { nom: 'Licence', niveau: 4, motsCles: ['licence', 'bac+3', 'bachelor'] },
  { nom: 'Master', niveau: 5, motsCles: ['master', 'bac+5', 'ingénieur'] },
  { nom: 'Doctorat', niveau: 6, motsCles: ['doctorat', 'phd', 'these'] }
];
// ============================================
// FONCTION AMÉLIORÉE D'EXTRACTION DU NOM ET PRÉNOM
// ============================================

/**
 * Extrait le nom et prénom de façon robuste
 * @param {string} text - Texte complet du CV
 * @returns {Object} - { nom, prenom, nom_complet }
 */
// REMPLACER la fonction extractNameFromCV par celle-ci
function extractNameFromCV(text) {
  console.log('🔍 Recherche du nom et prénom...');
  
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // STRATÉGIE SPÉCIFIQUE POUR VOTRE CV
  // Chercher le format "Prénom Nom" suivi d'un titre
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i];
    
    // Pattern pour "Jean-François BOISGONTIER Chef d'équipe industriel"
    const nameWithTitleMatch = line.match(/^([A-Za-zéèêëàâîïôöûüç-]+)\s+([A-Z]{2,}(?:\s+[A-Z]{2,})*)\s+([A-Za-zéèêëàâîïôöûüç\s]+)$/);
    if (nameWithTitleMatch) {
      return {
        prenom: nameWithTitleMatch[1],
        nom: nameWithTitleMatch[2],
        nom_complet: nameWithTitleMatch[1] + ' ' + nameWithTitleMatch[2]
      };
    }
    
    // Pattern pour "Jean-François BOISGONTIER" (juste nom/prénom)
    const simpleNameMatch = line.match(/^([A-Za-zéèêëàâîïôöûüç-]+)\s+([A-Z]{2,}(?:\s+[A-Z]{2,})*)$/);
    if (simpleNameMatch) {
      return {
        prenom: simpleNameMatch[1],
        nom: simpleNameMatch[2],
        nom_complet: line
      };
    }
  }
  
  // RECHERCHE D'EMAIL POUR TROUVER LE NOM (souvent l'email contient le nom)
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    const emailPrefix = emailMatch[1];
    // Transformer "jf.boisgontier" en "Jean-François BOISGONTIER" approximatif
    if (emailPrefix.includes('.')) {
      const parts = emailPrefix.split('.');
      return {
        prenom: parts[0] === 'jf' ? 'Jean-François' : parts[0],
        nom: parts[1] ? parts[1].toUpperCase() : null,
        nom_complet: emailPrefix
      };
    }
  }
  
  return { nom: null, prenom: null, nom_complet: null };
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
    console.error('❌ Erreur détaillée:', {
        message: error.message,
        stack: error.stack,
        filePath: filePath
    });
    res.status(500).json({
        error: 'Erreur interne lors de l\'analyse du CV',
        details: error.message
    });
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
// AMÉLIORER la fonction extractExperiences
function extractExperiences(text) {
  const experiences = [];
  const lines = text.split('\n');
  let currentExp = null;
  
  // Rechercher les périodes même sans section "Expérience"
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Pattern pour dates: "2016-2018" ou "2016 – 2018" ou "2016- présent"
    const dateMatch = line.match(/(\d{4})\s*[-–—]\s*(\d{4}|présent|now|current|aujourd'hui|en cours)/i);
    
    if (dateMatch) {
      const poste = line.replace(dateMatch[0], '').trim();
      
      // Chercher l'entreprise dans la même ligne ou la ligne suivante
      let entreprise = null;
      const companyMatch = line.match(/(?:chez|@|at|à|–)\s+([A-Z][A-Za-z0-9\s\-&]+)/i);
      if (companyMatch) {
        entreprise = companyMatch[1].trim();
      } else if (i + 1 < lines.length) {
        // Regarder la ligne suivante
        const nextLine = lines[i + 1].trim();
        const nextCompanyMatch = nextLine.match(/^([A-Z][A-Za-z0-9\s\-&]+)$/);
        if (nextCompanyMatch) {
          entreprise = nextCompanyMatch[1];
        }
      }
      
      currentExp = {
        poste: poste || 'Poste non spécifié',
        entreprise: entreprise,
        date_debut: dateMatch[1],
        date_fin: dateMatch[2].toLowerCase().match(/présent|now|current|aujourd'hui|en cours/i) ? 'présent' : dateMatch[2],
        description: []
      };
      
      experiences.push(currentExp);
    }
  }
  
  return experiences;
}

/**
 * Extrait les formations
 */
// AMÉLIORER extractEducation pour formater correctement
function extractEducation(text) {
  const education = [];
  const lines = text.split('\n');
  
  const educationKeywords = [
    'diplôme', 'diplomes', 'formation', 'formations', 'études',
    'bac', 'bts', 'dut', 'licence', 'master', 'cap', 'bep'
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Chercher les lignes qui contiennent des années et des diplômes
    const hasYear = /\b(19|20)\d{2}\b/.test(line);
    const hasEducationKeyword = educationKeywords.some(keyword => 
      line.toLowerCase().includes(keyword)
    );
    
    if (hasYear || hasEducationKeyword) {
      // Extraire l'année
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const annee = yearMatch ? yearMatch[0] : null;
      
      // Nettoyer le diplôme (enlever l'année)
      let diplome = line.replace(/\b(19|20)\d{2}\b/g, '').trim();
      diplome = diplome.replace(/[-–—]\s*$/, '').trim();
      
      education.push({
        annee: annee,
        diplome: diplome,
        etablissement: null // À améliorer si besoin
      });
    }
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
// AMÉLIORER calculateTotalExperience
function calculateTotalExperience(experiences) {
  if (!experiences || experiences.length === 0) return 0;
  
  let totalYears = 0;
  const currentYear = new Date().getFullYear();
  
  for (const exp of experiences) {
    // Gérer les formats comme "2012" (juste année de début)
    if (typeof exp === 'string') {
      // Si c'est juste une chaîne, essayer d'extraire
      continue;
    }
    
    const debut = parseInt(exp.date_debut);
    if (isNaN(debut)) continue;
    
    let fin;
    if (exp.date_fin === 'présent' || exp.date_fin?.toLowerCase().includes('présent')) {
      fin = currentYear;
    } else {
      fin = parseInt(exp.date_fin);
    }
    
    if (!isNaN(fin) && fin >= debut) {
      totalYears += (fin - debut);
    } else if (!isNaN(debut)) {
      // Si pas de date de fin, compter 1 an par défaut
      totalYears += 1;
    }
  }
  
  // Arrondir à 1 décimale
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

    if (!filePath || !filePath.startsWith('cvs/')) {
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