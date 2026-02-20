// /api/analyze.js
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

// Initialisation Supabase
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

// Fonctions d'extraction =================================

/**
 * Extrait le texte d'un fichier
 */
async function extractTextFromFile(fileBuffer, fileName) {
  const fileType = fileName.split('.').pop().toLowerCase();
  
  try {
    if (fileType === 'pdf') {
      const data = await pdfParse(Buffer.from(fileBuffer));
      return data.text;
    } else if (fileType === 'docx') {
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      return value;
    }
    throw new Error(`Format non supporté: ${fileType}`);
  } catch (error) {
    throw new Error(`Erreur d'extraction: ${error.message}`);
  }
}

/**
 * Nettoie le texte (enligne les caractères bizarres, numéros de page)
 */
function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u2018\u2019\u201C\u201D\u2026]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/===== Page \d+ =====/g, '')
    .replace(/\d+\s+\d+\s+\d+[\s\d]*/g, '') // Enlève les numéros de page style "0 0 0 0 0"
    .trim();
}

/**
 * Extrait le nom et prénom
 */
function extractName(text, fileName) {
  const lines = text.split('\n').filter(l => l.trim().length > 3);
  
  // 1. Chercher dans les 10 premières lignes
  for (const line of lines.slice(0, 10)) {
    // Pattern: "Prénom Nom" ou "NOM Prénom"
    const patterns = [
      /^([A-Z][a-zéèêëàâîïôöûüç-]+)\s+([A-Z][a-zéèêëàâîïôöûüç-]+)/,
      /^([A-Z]{2,})\s+([A-Z][a-zéèêëàâîïôöûüç-]+)/,
      /^([A-Z][a-zéèêëàâîïôöûüç-]+)\s+([A-Z]{2,})/
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          prenom: match[1].trim(),
          nom: match[2].trim()
        };
      }
    }
  }
  
  // 2. Fallback: essayer d'extraire du nom de fichier
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const nameParts = fileNameWithoutExt
    .replace(/CV[_-]?/i, '')
    .replace(/[_-]/g, ' ')
    .split(' ')
    .filter(p => p.length > 0);
  
  if (nameParts.length >= 2) {
    return {
      prenom: nameParts[0],
      nom: nameParts.slice(1).join(' ')
    };
  }
  
  return { prenom: null, nom: null };
}

/**
 * Extrait l'email
 */
function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  return emails && emails.length > 0 ? emails[0] : null;
}

/**
 * Extrait le téléphone (formats français/internationaux)
 */
function extractPhone(text) {
  const phoneRegex = /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
  const phones = text.match(phoneRegex);
  
  if (phones && phones.length > 0) {
    // Nettoyer le numéro
    return phones[0].replace(/[\s.-]/g, '');
  }
  
  // Fallback: chercher des patterns plus simples
  const simplePhoneRegex = /(0[1-9])(?:[.\-\s]?\d{2}){4}/g;
  const simplePhones = text.match(simplePhoneRegex);
  return simplePhones && simplePhones.length > 0 ? simplePhones[0].replace(/[\s.-]/g, '') : null;
}

/**
 * Extrait les compétences techniques
 */
function extractSkills(text) {
  const commonSkills = [
    // DevOps & Cloud
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab', 'GitHub',
    'Ansible', 'Terraform', 'Linux', 'Ubuntu', 'Debian', 'RedHat',
    
    // Programmation
    'Python', 'Java', 'JavaScript', 'TypeScript', 'PHP', 'C++', 'C#', 'Ruby',
    'Go', 'Rust', 'Swift', 'Kotlin', 'Bash', 'PowerShell',
    
    // Frameworks
    'React', 'Vue', 'Angular', 'Node.js', 'Spring', 'Django', 'Flask',
    'Laravel', 'Symfony', '.NET', 'Express',
    
    // Bases de données
    'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Oracle', 'SQL Server',
    'Elasticsearch', 'Redis', 'Cassandra',
    
    // Outils
    'Git', 'SVN', 'Jira', 'Confluence', 'ServiceNow', 'SharePoint',
    'Office', 'Excel', 'PowerPoint', 'Word', 'Outlook',
    
    // ERP
    'SAP', 'ERP', 'Sylob', 'EBP', 'CEGID', 'OpenERP', 'Divalto',
    
    // RH / Commerce
    'Recrutement', 'Sourcing', 'ADP', 'Paie', 'CSE', 'DUP', 'NAO',
    'Vente', 'Relation client', 'Prospection', 'Négociation',
    
    // Communication
    'Canva', 'Photoshop', 'Illustrator', 'WordPress', 'Hootsuite',
    'Réseaux sociaux', 'Community management'
  ];
  
  const lowerText = text.toLowerCase();
  const found = new Set();
  
  commonSkills.forEach(skill => {
    if (lowerText.includes(skill.toLowerCase())) {
      found.add(skill);
    }
  });
  
  return Array.from(found);
}

/**
 * Extrait les diplômes
 */
function extractDiplomas(text) {
  const diplomas = [
    { name: 'Bac', patterns: ['BAC', 'Baccalauréat'] },
    { name: 'BTS', patterns: ['BTS', 'Brevet de Technicien Supérieur'] },
    { name: 'DUT', patterns: ['DUT', 'Diplôme Universitaire de Technologie'] },
    { name: 'Licence', patterns: ['Licence', 'Bac+3'] },
    { name: 'Master', patterns: ['Master', 'Bac+5', 'M2', 'M1'] },
    { name: 'Doctorat', patterns: ['Doctorat', 'PhD', 'Thèse'] },
    { name: 'Ingénieur', patterns: ['Ingénieur', 'Diplôme d\'ingénieur'] },
    { name: 'CAP', patterns: ['CAP'] },
    { name: 'BEP', patterns: ['BEP'] },
    { name: 'BAFA', patterns: ['BAFA'] }
  ];
  
  const lowerText = text.toLowerCase();
  const found = new Set();
  
  diplomas.forEach(diploma => {
    diploma.patterns.forEach(pattern => {
      if (lowerText.includes(pattern.toLowerCase())) {
        found.add(diploma.name);
      }
    });
  });
  
  return Array.from(found);
}

/**
 * Extrait les années d'expérience
 */
function extractExperience(text) {
  // Chercher des patterns comme "10 ans d'expérience"
  const patterns = [
    /(\d+)\s*(?:ans?|années?)\s*d['']?expérience/i,
    /expérience\s*(?:de\s*)?(\d+)\s*(?:ans?|années?)/i,
    /(\d+)[\+]\s*(?:ans?|années?)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }
  
  // Compter les expériences professionnelles
  const experienceSections = text.match(/Expériences?\s+professionnelles?/i);
  if (experienceSections) {
    const lines = text.split('\n');
    let count = 0;
    let inExperience = false;
    
    for (const line of lines) {
      if (line.match(/Expériences?\s+professionnelles?/i)) {
        inExperience = true;
        continue;
      }
      
      if (inExperience) {
        if (line.match(/Formations?\s*:/i) || line.match(/Compétences?\s*:/i)) {
          break;
        }
        if (line.match(/\d{4}\s*[-–—]\s*\d{4}/) || line.match(/20\d{2}\s*[-–—]\s*(?:20\d{2}|aujourd'hui|maintenant)/i)) {
          count++;
        }
      }
    }
    
    return count > 0 ? count : null;
  }
  
  return null;
}

/**
 * Extrait le titre du poste
 */
function extractJobTitle(text) {
  const lines = text.split('\n');
  
  // Chercher dans les premières lignes
  for (const line of lines.slice(0, 15)) {
    const patterns = [
      /(Ingénieur|Développeur|Chef de projet|Consultant|Architecte|Administrateur|Technicien|Responsable|Directeur|Manager|Chargé|Assistant|Commercial|Vendeur|Animateur|Hôtesse|Réceptionniste)/i
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        // Prendre la ligne entière si elle est courte
        if (line.length < 100) {
          return line.trim();
        }
        return match[0];
      }
    }
  }
  
  return null;
}

// Route principale ======================================

export default async function handler(req, res) {
  // CORS
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
    const { filePath, jobDescription = "" } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, error: "filePath est requis" });
    }

    console.log(`📥 Analyse: ${filePath}`);

    // 1. Télécharger le fichier
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

    // 2. Extraire le texte
    const fileBuffer = await file.arrayBuffer();
    const fileName = filePath.split('/').pop();
    const rawText = await extractTextFromFile(fileBuffer, fileName);
    const text = cleanText(rawText);
    
    console.log(`✅ Texte extrait: ${text.length} caractères`);

    // 3. Extraire les informations
    const { prenom, nom } = extractName(text, fileName);
    const email = extractEmail(text);
    const telephone = extractPhone(text);
    const competences = extractSkills(text);
    const diplomes = extractDiplomas(text);
    const annees_experience = extractExperience(text);
    const poste = extractJobTitle(text);
    
    // Niveau = dernier diplôme ou poste
    const niveau = diplomes.length > 0 
      ? diplomes[diplomes.length - 1] 
      : (poste ? poste.split(' ')[0] : null);

    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;

    const candidateInfo = {
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      postes: poste,
      niveau: niveau,
      competences: competences,
      diplomes: diplomes,
      annees_experience: annees_experience,
      cv_url: cvUrl,
      cv_filename: fileName,
      fichier: filePath
    };

    console.log("✅ Analyse terminée");
    
    return res.status(200).json({
      success: true,
      candidateInfo
    });

  } catch (error) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}