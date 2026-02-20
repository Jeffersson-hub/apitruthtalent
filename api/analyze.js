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

// ==================== CONFIGURATION ====================
const CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 Mo
  MIN_TEXT_LENGTH: 100,
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
    technical: [ ... ], // inchangé
    soft: [ ... ],
    rh: [ ... ],
    commercial: [ ... ],
    communication: [ ... ]
  },
  // NOUVEAU: Base de données des métiers
  METIERS_DATABASE: [
    { pattern: /ingénieur\s+(?:devops|système|réseau|logiciel|développement)/i, value: "Ingénieur DevOps" },
    { pattern: /ingénieur\s+(?:informatique|logiciel|développement)/i, value: "Ingénieur Logiciel" },
    { pattern: /développeur\s+(?:full[ -]stack|web|mobile|back[ -]end|front[ -]end)/i, value: "Développeur" },
    { pattern: /data\s+(?:scientist|analyst|engineer)/i, value: "Data" },
    { pattern: /chef\s+de\s+projet|project\s+manager/i, value: "Chef de Projet" },
    { pattern: /product\s+(?:owner|manager)/i, value: "Product" },
    { pattern: /charg[ée]\s+(?:de\s+)?recrutement|recruteur|sourcing/i, value: "Recruteur" },
    { pattern: /charg[ée]\s+(?:des\s+)?ressources\s+humaines|charg[ée]\s+rh/i, value: "Chargé RH" },
    { pattern: /assistant[ée]\s+(?:des\s+)?ressources\s+humaines|assistant[ée]\s+rh/i, value: "Assistant RH" },
    { pattern: /responsable\s+(?:des\s+)?ressources\s+humaines|responsable\s+rh/i, value: "Responsable RH" },
    { pattern: /commercial|charg[ée]\s+de\s+clientèle|conseiller\s+de\s+vente|vendeur|vendeuse/i, value: "Commercial" },
    { pattern: /responsable\s+commercial|responsable\s+des\s+ventes/i, value: "Responsable Commercial" },
    { pattern: /marketing|community\s+manager|charg[ée]\s+de\s+communication/i, value: "Marketing / Communication" },
    { pattern: /administrateur\s+(?:système|réseau|bases\s+de\s+données)/i, value: "Administrateur Système" },
    { pattern: /technicien\s+(?:informatique|support|réseau)/i, value: "Technicien" },
    { pattern: /support\s+(?:informatique|technique)/i, value: "Support Technique" }
  ]
};

// ==================== FONCTIONS D'EXTRACTION ====================

// ... (gardez validateFileFormat, extractAndValidateContent, calculateATSScore, analyzeStructure, extractSkillsWithCategories, generateRecommendations inchangés) ...

/**
 * NOUVELLE FONCTION: Extrait le métier du candidat
 */
function extractJobTitle(text) {
  const lines = text.split('\n').slice(0, 30); // Chercher dans les 30 premières lignes
  
  // 1. Chercher un titre explicite (# Titre, ## Titre, ou ligne en gras)
  for (const line of lines) {
    const cleanLine = line.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
    
    // Ignorer les lignes trop longues ou trop courtes
    if (cleanLine.length < 10 || cleanLine.length > 100) continue;
    
    // Chercher dans la base des métiers
    for (const metier of CONFIG.METIERS_DATABASE) {
      if (metier.pattern.test(cleanLine)) {
        return metier.value;
      }
    }
  }
  
  // 2. Chercher dans le résumé/profil
  const summarySection = text.match(/(?:profil|résumé|summary|about)[:\s]+([^\n]+)/i);
  if (summarySection) {
    const summary = summarySection[1];
    for (const metier of CONFIG.METIERS_DATABASE) {
      if (metier.pattern.test(summary)) {
        return metier.value;
      }
    }
  }
  
  // 3. Chercher dans les premières expériences
  const experienceMatch = text.match(/expériences?\s+professionnelles?[:\s]+([^\n]+(?:\n[^\n]+){0,2})/i);
  if (experienceMatch) {
    const expText = experienceMatch[1];
    for (const metier of CONFIG.METIERS_DATABASE) {
      if (metier.pattern.test(expText)) {
        return metier.value;
      }
    }
  }
  
  return null;
}

/**
 * FONCTION AMÉLIORÉE: Extrait les années d'expérience avec plus de précision
 */
function extractExperience(text) {
  // Méthode 1: Pattern direct "X ans d'expérience"
  const directPatterns = [
    /(\d+)\s*(?:ans?|années?)\s*d['']?expérience/i,
    /expérience\s*(?:de\s*)?(\d+)\s*(?:ans?|années?)/i,
    /(\d+)[\+]\s*(?:ans?|années?)/i
  ];
  
  for (const pattern of directPatterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  
  // Méthode 2: Compter les expériences par dates
  const experienceSection = text.match(/expériences?\s+professionnelles?/i);
  if (experienceSection) {
    const afterSection = text.substring(experienceSection.index).split('\n').slice(0, 100);
    let totalYears = 0;
    let experienceCount = 0;
    
    // Patterns de dates: "2019 - 2022", "2020-2023", "2021 à aujourd'hui"
    const datePattern = /(\d{4})\s*[-–—]\s*(?:(\d{4})|aujourd'hui|maintenant|à ce jour|present)/i;
    
    for (const line of afterSection) {
      const match = line.match(datePattern);
      if (match) {
        const startYear = parseInt(match[1]);
        const endYear = match[2] ? parseInt(match[2]) : new Date().getFullYear();
        const years = endYear - startYear;
        if (years > 0 && years < 15) { // Éviter les anomalies
          totalYears += years;
          experienceCount++;
        }
      }
      
      // Sortir si on arrive à la section formation
      if (line.match(/formations?\s*:/i) && experienceCount > 0) break;
    }
    
    if (experienceCount > 0) {
      // Retourner le total ou la moyenne selon le cas
      return Math.round(totalYears);
    }
  }
  
  // Méthode 3: Extraction depuis le texte de l'expérience
  const yearMatches = text.matchAll(/(\d{4})\s*[-–—]\s*(\d{4})/g);
  let totalFromRanges = 0;
  let rangeCount = 0;
  
  for (const match of yearMatches) {
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    if (start > 1900 && end > 1900 && end > start && (end - start) < 15) {
      totalFromRanges += (end - start);
      rangeCount++;
    }
  }
  
  if (rangeCount > 0) {
    return Math.round(totalFromRanges);
  }
  
  return null;
}

/**
 * NOUVELLE FONCTION: Détermine le niveau d'expérience (junior/confirmé/senior)
 */
function getExperienceLevel(years) {
  if (!years || years < 0) return "junior";
  if (years < 3) return "junior";
  if (years < 7) return "confirmé";
  return "senior";
}

/**
 * FONCTION AMÉLIORÉE: Extrait le diplôme le plus élevé
 */
function extractDiplomas(text) {
  const diplomas = [
    { name: 'Bac', level: 1, patterns: [/bac(?:calauréat)?(?:\s+pro)?/i] },
    { name: 'BTS', level: 2, patterns: [/bts\b/i] },
    { name: 'DUT', level: 2, patterns: [/dut\b/i] },
    { name: 'Licence', level: 3, patterns: [/licence\b|bac\+3/i] },
    { name: 'Master', level: 4, patterns: [/master\b|bac\+5/i] },
    { name: 'Ingénieur', level: 4, patterns: [/ingénieur\b(?!.*junior)/i] },
    { name: 'Doctorat', level: 5, patterns: [/doctorat\b|phd\b/i] },
    { name: 'CAP', level: 1, patterns: [/cap\b(?!itale)/i] },
    { name: 'BEP', level: 1, patterns: [/bep\b/i] },
    { name: 'BAFA', level: 1, patterns: [/bafa\b/i] }
  ];
  
  const found = [];
  diplomas.forEach(d => {
    d.patterns.forEach(p => {
      if (p.test(text)) {
        found.push({ name: d.name, level: d.level });
      }
    });
  });
  
  // Trier par niveau et retourner les noms
  found.sort((a, b) => b.level - a.level);
  return found.map(d => d.name);
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
      return res.status(400).json({ success: false, error: "filePath est requis" });
    }

    console.log(`📥 Analyse avec validation: ${filePath}`);

    // ===== Téléchargement =====
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !file) {
      return res.status(404).json({ success: false, error: "Fichier introuvable" });
    }

    const fileBuffer = await file.arrayBuffer();
    const fileName = filePath.split('/').pop();

    // ===== Validation technique =====
    const formatErrors = validateFileFormat(file, fileName);
    if (formatErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation technique échouée",
        details: formatErrors,
        validationLevel: 1
      });
    }

    // ===== Validation de contenu =====
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

    // ===== Validation sémantique =====
    const structure = analyzeStructure(text);
    const atsScore = calculateATSScore(text);
    const recommendations = generateRecommendations(text, atsScore, structure);
    const skills = extractSkillsWithCategories(text);

    // ===== EXTRACTION AMÉLIORÉE =====
    const { prenom, nom } = extractName(text, fileName);
    const email = extractEmail(text);
    const telephone = extractPhone(text);
    
    // ✅ Nouvelle extraction du métier
    const metiers = extractJobTitle(text);
    
    // ✅ Nouvelle extraction de l'expérience (plus précise)
    const annees_experience = extractExperience(text);
    
    // ✅ Niveau d'expérience (junior/confirmé/senior)
    const niveau_experience = getExperienceLevel(annees_experience);
    
    // ✅ Diplômes (avec niveau)
    const diplomes = extractDiplomas(text);
    const niveau = diplomes.length > 0 ? diplomes[0] : null;

    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;

    // ===== Construction de la réponse =====
    const candidateInfo = {
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      metiers: metiers,  // ← NOUVEAU
      competences: [...skills.technical, ...skills.soft, ...skills.rh, ...skills.commercial, ...skills.communication],
      diplomes: diplomes,
      niveau: niveau,
      annees_experience: annees_experience || 0,
      niveau_experience: niveau_experience,  // ← NOUVEAU
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

    console.log("✅ Analyse terminée:", { 
      nom, prenom, 
      metiers, 
      annees_experience, 
      niveau_experience,
      niveau 
    });

    const response = {
      success: true,
      candidateInfo,
      validation,
      warning: !atsScore.isPassing ? "CV potentiellement incomplet. Consultez les recommandations." : null
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}