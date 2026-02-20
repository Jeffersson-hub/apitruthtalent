// /api/analyze.js
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ Variables d'environnement Supabase manquantes");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ==================== CONFIGURATION ====================
const CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 Mo
  MIN_TEXT_LENGTH: 100, // Caractères minimum pour un CV valide
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  REQUIRED_FIELDS: {
    email: { weight: 30, pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
    phone: { weight: 20, pattern: /(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/ },
    name: { weight: 25, pattern: /[A-Z][a-zà-ÿ'-]+(?:\s+[A-Z][a-zà-ÿ'-]+)*/ },
    experience: { weight: 15, pattern: /\d+\s*(?:ans?|années?)\s*d'expérience|expérience\s+professionnelle/i },
    education: { weight: 10, pattern: /(?:bac|bts|licence|master|doctorat|diplôme|formation)/i }
  },
  SKILLS_DATABASE: {
    technical: [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'PHP', 'Ruby', 'Go',
      'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Spring',
      'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Oracle',
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab',
      'Linux', 'Bash', 'PowerShell', 'Ansible', 'Terraform'
    ],
    soft: [
      'Communication', 'Travail d\'équipe', 'Autonomie', 'Adaptabilité',
      'Résolution de problèmes', 'Gestion du temps', 'Créativité',
      'Leadership', 'Négociation', 'Relation client'
    ],
    rh: [
      'Recrutement', 'Sourcing', 'ADP', 'Paie', 'CSE', 'NAO',
      'Administration du personnel', 'Droit du travail', 'Formation'
    ],
    commercial: [
      'Vente', 'Prospection', 'Négociation commerciale', 'Relation client',
      'Développement commercial', 'Fidélisation'
    ],
    communication: [
      'Canva', 'Photoshop', 'WordPress', 'Hootsuite', 'Réseaux sociaux',
      'Community management', 'Content creation'
    ]
  }
};

// ==================== NIVEAU 1: VALIDATION TECHNIQUE ====================

/**
 * Valide le format et la taille du fichier
 */
function validateFileFormat(file, fileName) {
  const errors = [];
  
  // Vérifier le type MIME
  if (!CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
    errors.push(`Format non accepté: ${file.type || 'inconnu'}. Utilisez PDF ou DOCX.`);
  }
  
  // Vérifier la taille
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    errors.push(`Fichier trop volumineux: ${(file.size / 1024 / 1024).toFixed(2)} Mo (max ${CONFIG.MAX_FILE_SIZE / 1024 / 1024} Mo)`);
  }
  
  // Vérifier l'extension
  const ext = fileName.split('.').pop().toLowerCase();
  if (!['pdf', 'docx'].includes(ext)) {
    errors.push(`Extension non supportée: .${ext}`);
  }
  
  return errors;
}

// ==================== NIVEAU 2: VALIDATION DE CONTENU ====================

/**
 * Extrait le texte et vérifie sa lisibilité
 */
async function extractAndValidateContent(fileBuffer, fileName) {
  const fileType = fileName.split('.').pop().toLowerCase();
  
  try {
    let text = '';
    
    if (fileType === 'pdf') {
      const data = await pdfParse(Buffer.from(fileBuffer));
      text = data.text;
    } else if (fileType === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      text = value;
    }
    
    // Nettoyer le texte pour l'analyse
    const cleanText = text
      .replace(/[^\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u2018\u2019\u201C\u201D\u2026]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Vérifier la longueur minimale
    if (cleanText.length < CONFIG.MIN_TEXT_LENGTH) {
      throw new Error(`Texte insuffisant: ${cleanText.length} caractères (minimum ${CONFIG.MIN_TEXT_LENGTH})`);
    }
    
    // Détecter les CV scannés (trop de caractères spéciaux)
    const specialChars = (cleanText.match(/[^a-zA-Z0-9\sàâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ.,;:!?()-]/g) || []).length;
    const specialCharRatio = specialChars / cleanText.length;
    
    if (specialCharRatio > 0.3) { // Plus de 30% de caractères spéciaux = probablement scanné
      throw new Error("CV scanné non lisible (texte non extractible). Utilisez un CV textuel.");
    }
    
    return { valid: true, text: cleanText };
    
  } catch (error) {
    throw new Error(`Erreur d'extraction: ${error.message}`);
  }
}

// ==================== NIVEAU 3: VALIDATION SÉMANTIQUE ====================

/**
 * Calcule un score ATS basé sur la présence d'informations essentielles
 */
function calculateATSScore(text) {
  const results = {};
  let totalScore = 0;
  
  for (const [field, config] of Object.entries(CONFIG.REQUIRED_FIELDS)) {
    const found = config.pattern.test(text);
    results[field] = {
      found,
      weight: config.weight,
      score: found ? config.weight : 0
    };
    totalScore += results[field].score;
  }
  
  return {
    total: totalScore,
    maxPossible: Object.values(CONFIG.REQUIRED_FIELDS).reduce((sum, f) => sum + f.weight, 0),
    details: results,
    isPassing: totalScore >= 60 // Seuil à 60% pour être considéré valide
  };
}

/**
 * Analyse la structure du CV (présence de sections clés)
 */
function analyzeStructure(text) {
  const sections = {
    experience: /expériences?\s+professionnelles?/i.test(text),
    formation: /formation|diplôme|éducation/i.test(text),
    competences: /compétences|skills/i.test(text),
    contact: /@|tél|mobile|📞|📧/.test(text)
  };
  
  const sectionCount = Object.values(sections).filter(Boolean).length;
  
  return {
    sections,
    quality: sectionCount >= 3 ? 'good' : sectionCount >= 2 ? 'average' : 'poor'
  };
}

/**
 * Extrait les compétences avec catégorisation
 */
function extractSkillsWithCategories(text) {
  const lowerText = text.toLowerCase();
  const skills = {
    technical: [],
    soft: [],
    rh: [],
    commercial: [],
    communication: []
  };
  
  // Détecter le contexte pour éviter les faux positifs
  const context = {
    isTechnical: /\b(ingénieur|développeur|devops|sysops|infrastructure|programmation|code)\b/i.test(lowerText),
    isRH: /\b(rh|ressources humaines|recrutement|paie|administration du personnel)\b/i.test(lowerText),
    isCommercial: /\b(vente|commercial|client|prospection|négociation)\b/i.test(lowerText),
    isCommunication: /\b(communication|réseaux sociaux|marketing|community)\b/i.test(lowerText)
  };
  
  Object.entries(CONFIG.SKILLS_DATABASE).forEach(([category, skillList]) => {
    skillList.forEach(skill => {
      const skillLower = skill.toLowerCase();
      // Vérifier si le skill est présent comme mot entier
      const regex = new RegExp(`\\b${skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      
      if (regex.test(lowerText)) {
        // Filtrer selon le contexte
        if (category === 'technical' && !context.isTechnical && !context.isCommercial) return;
        if (category === 'rh' && !context.isRH) return;
        if (category === 'commercial' && !context.isCommercial && !context.isRH) return;
        if (category === 'communication' && !context.isCommunication) return;
        
        skills[category].push(skill);
      }
    });
  });
  
  return skills;
}

/**
 * Génère des recommandations d'amélioration
 */
function generateRecommendations(text, atsScore, structure) {
  const recommendations = [];
  
  if (atsScore.details.email.score === 0) {
    recommendations.push("Ajoutez votre email (format professionnel de préférence)");
  }
  
  if (atsScore.details.phone.score === 0) {
    recommendations.push("Ajoutez votre numéro de téléphone au format français");
  }
  
  if (atsScore.details.name.score === 0) {
    recommendations.push("Votre nom et prénom doivent être clairement visibles en haut du CV");
  }
  
  if (!structure.sections.experience) {
    recommendations.push("Ajoutez une section 'Expériences professionnelles'");
  }
  
  if (!structure.sections.formation) {
    recommendations.push("Ajoutez une section 'Formation' ou 'Diplômes'");
  }
  
  if (!structure.sections.competences) {
    recommendations.push("Ajoutez une section 'Compétences' pour mieux cibler les offres");
  }
  
  if (text.length < 500) {
    recommendations.push("Votre CV est trop court. Développez vos expériences et compétences.");
  }
  
  if (text.split('\n').filter(l => l.trim().length > 0).length < 20) {
    recommendations.push("Votre CV manque de détails. Ajoutez des descriptions pour chaque poste.");
  }
  
  return recommendations;
}

// ==================== FONCTIONS D'EXTRACTION PRINCIPALES ====================

function extractName(text, fileName) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const ignoreWords = ['cv', 'curriculum', 'vitae', 'résumé', 'resume', 'page', 'contact', 'email', 'téléphone', 'adresse'];
  
  for (const line of lines.slice(0, 20)) {
    const cleanLine = line.trim().replace(/^#+\s*/, '');
    
    if (cleanLine.length > 50 || ignoreWords.some(word => cleanLine.toLowerCase().includes(word))) {
      continue;
    }
    
    // Pattern: Prénom Nom
    const matchPrenomNom = cleanLine.match(/^([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)\s+([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)$/);
    if (matchPrenomNom && !matchPrenomNom[1].includes(',')) {
      return { prenom: matchPrenomNom[1].trim(), nom: matchPrenomNom[2].trim() };
    }
    
    // Pattern: NOM Prénom
    const matchNomPrenom = cleanLine.match(/^([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)\s+([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)$/);
    if (matchNomPrenom && !matchNomPrenom[1].includes(',')) {
      return { prenom: matchNomPrenom[2].trim(), nom: matchNomPrenom[1].trim() };
    }
  }
  
  // Fallback sur nom de fichier
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const cleanFileName = fileNameWithoutExt
    .replace(/CV[_-]?/gi, '')
    .replace(/[_-]/g, ' ')
    .replace(/\d+/g, '')
    .replace(/fr|vendeuse|poste|stage|alternance|cdi|cdd/gi, '')
    .trim();
  
  const nameParts = cleanFileName.split(' ').filter(p => p.length > 2);
  
  if (nameParts.length >= 2) {
    if (nameParts[0] === nameParts[0].toUpperCase()) {
      return { nom: nameParts[0], prenom: nameParts.slice(1).join(' ') };
    } else if (nameParts[nameParts.length-1] === nameParts[nameParts.length-1].toUpperCase()) {
      return { prenom: nameParts.slice(0, -1).join(' '), nom: nameParts[nameParts.length-1] };
    } else {
      return { prenom: nameParts[0], nom: nameParts.slice(1).join(' ') };
    }
  }
  
  return { prenom: null, nom: null };
}

function extractEmail(text) {
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emails) {
    return emails.find(e => !e.includes('example') && !e.includes('test')) || emails[0];
  }
  return null;
}

function extractPhone(text) {
  const phones = text.match(/(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/g);
  return phones ? phones[0].replace(/[\s.-]/g, '') : null;
}

function extractExperience(text) {
  const patterns = [
    /(\d+)\s*(?:ans?|années?)\s*d['']?expérience/i,
    /expérience\s*(?:de\s*)?(\d+)\s*(?:ans?|années?)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  
  const experienceSection = text.match(/expériences?\s+professionnelles?/i);
  if (experienceSection) {
    const afterSection = text.substring(experienceSection.index);
    const lines = afterSection.split('\n').slice(0, 50);
    let count = 0;
    
    for (const line of lines) {
      if (line.match(/\d{4}\s*[-–—]\s*(?:\d{4}|aujourd'hui|maintenant)/i)) count++;
      if (line.match(/formations?\s*:/i)) break;
    }
    return count > 0 ? count : null;
  }
  
  return null;
}

function extractDiplomas(text) {
  const diplomas = [
    { name: 'Bac', patterns: [/bac(?:calauréat)?(?:\s+pro)?/i] },
    { name: 'BTS', patterns: [/bts\b/i] },
    { name: 'DUT', patterns: [/dut\b/i] },
    { name: 'Licence', patterns: [/licence\b|bac\+3/i] },
    { name: 'Master', patterns: [/master\b|bac\+5/i] },
    { name: 'Doctorat', patterns: [/doctorat\b|phd\b/i] },
    { name: 'Ingénieur', patterns: [/ingénieur\b(?!.*junior)/i] },
    { name: 'CAP', patterns: [/cap\b(?!itale)/i] },
    { name: 'BEP', patterns: [/bep\b/i] },
    { name: 'BAFA', patterns: [/bafa\b/i] }
  ];
  
  const found = new Set();
  diplomas.forEach(d => {
    d.patterns.forEach(p => {
      if (p.test(text)) found.add(d.name);
    });
  });
  
  return Array.from(found);
}

// ==================== ROUTE PRINCIPALE ====================

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée' });
  }

  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ 
        success: false, 
        error: "filePath est requis" 
      });
    }

    console.log(`📥 Analyse avec validation: ${filePath}`);

    // ===== ÉTAPE 1: Téléchargement =====
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !file) {
      return res.status(404).json({ 
        success: false, 
        error: "Fichier introuvable",
        details: downloadError?.message 
      });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileName = filePath.split('/').pop();

    // ===== ÉTAPE 2: Validation technique (Niveau 1) =====
    const formatErrors = validateFileFormat(file, fileName);
    if (formatErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation technique échouée",
        details: formatErrors,
        validationLevel: 1
      });
    }

    // ===== ÉTAPE 3: Validation de contenu (Niveau 2) =====
    let text;
    try {
      const validation = await extractAndValidateContent(fileBuffer, fileName);
      text = validation.text;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Validation de contenu échouée",
        details: [error.message],
        validationLevel: 2
      });
    }

    // ===== ÉTAPE 4: Validation sémantique (Niveau 3) =====
    const structure = analyzeStructure(text);
    const atsScore = calculateATSScore(text);
    const recommendations = generateRecommendations(text, atsScore, structure);
    const skills = extractSkillsWithCategories(text);

    // ===== ÉTAPE 5: Extraction des informations =====
    const { prenom, nom } = extractName(text, fileName);
    const email = extractEmail(text);
    const telephone = extractPhone(text);
    const diplomes = extractDiplomas(text);
    const annees_experience = extractExperience(text);
    
    const niveau = diplomes.length > 0 ? diplomes[diplomes.length - 1] : null;

    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;

    // ===== ÉTAPE 6: Construction de la réponse =====
    const candidateInfo = {
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      competences: [...skills.technical, ...skills.soft, ...skills.rh, ...skills.commercial, ...skills.communication],
      diplomes: diplomes,
      niveau: niveau,
      annees_experience: annees_experience,
      cv_url: cvUrl,
      cv_filename: fileName,
      fichier: filePath
    };

    const validation = {
      atsScore: atsScore.total,
      atsMaxScore: atsScore.maxPossible,
      atsPassing: atsScore.isPassing,
      structure: structure.quality,
      recommendations: recommendations,
      skills: skills
    };

    console.log("✅ Analyse terminée:", { candidateInfo, validation });

    // Si le score ATS est trop bas, on retourne quand même mais avec un avertissement
    const response = {
      success: true,
      candidateInfo,
      validation,
      warning: !atsScore.isPassing ? "CV potentiellement incomplet. Consultez les recommandations." : null
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}