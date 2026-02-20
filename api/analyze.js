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

// CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ==================== FONCTIONS D'EXTRACTION ====================

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
 * Nettoie le texte (enlève les caractères bizarres, numéros de page)
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
 * Extrait le nom et prénom - VERSION AMÉLIORÉE
 */
function extractName(text, fileName) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  
  // 1. Chercher un pattern "Prénom Nom" ou "NOM Prénom" dans les 20 premières lignes
  for (const line of lines.slice(0, 20)) {
    const cleanLine = line.trim();
    
    // Pattern: Prénom Nom (ex: "Jean-François Boisgontier")
    const matchPrenomNom = cleanLine.match(/^([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)\s+([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)$/);
    if (matchPrenomNom) {
      return {
        prenom: matchPrenomNom[1].trim(),
        nom: matchPrenomNom[2].trim()
      };
    }
    
    // Pattern: NOM Prénom (ex: "BOISGONTIER Jean-François")
    const matchNomPrenom = cleanLine.match(/^([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)\s+([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)$/);
    if (matchNomPrenom) {
      return {
        prenom: matchNomPrenom[2].trim(),
        nom: matchNomPrenom[1].trim()
      };
    }
  }
  
  // 2. Chercher un pattern avec # (ex: "# Jean-François Boisgontier")
  for (const line of lines.slice(0, 10)) {
    const match = line.match(/#\s*([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)\s+([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)/);
    if (match) {
      return {
        prenom: match[1].trim(),
        nom: match[2].trim()
      };
    }
  }
  
  // 3. Fallback: extraire du nom de fichier
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const cleanFileName = fileNameWithoutExt
    .replace(/CV[_-]?/gi, '')
    .replace(/[_-]/g, ' ')
    .replace(/\d+/g, '')
    .trim();
  
  const nameParts = cleanFileName.split(' ').filter(p => p.length > 0);
  
  if (nameParts.length >= 2) {
    // Deviner : si la première partie est en majuscules, c'est probablement le nom
    if (nameParts[0] === nameParts[0].toUpperCase()) {
      return {
        nom: nameParts[0],
        prenom: nameParts.slice(1).join(' ')
      };
    } else {
      return {
        prenom: nameParts[0],
        nom: nameParts.slice(1).join(' ')
      };
    }
  }
  
  return { prenom: null, nom: null };
}

/**
 * Extrait l'email - VERSION AMÉLIORÉE
 */
function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  
  if (emails && emails.length > 0) {
    // Filtrer les emails trop génériques
    const validEmail = emails.find(e => 
      !e.includes('example') && 
      !e.includes('test') && 
      !e.includes('nom') &&
      e.includes('.')
    );
    return validEmail || emails[0];
  }
  return null;
}

/**
 * Extrait le téléphone - VERSION AMÉLIORÉE
 */
function extractPhone(text) {
  // Format français: 06 12 34 56 78 ou +33612345678
  const phoneRegex = /(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/g;
  const phones = text.match(phoneRegex);
  
  if (phones && phones.length > 0) {
    // Nettoyer et retourner le premier numéro valide
    return phones[0].replace(/[\s.-]/g, '');
  }
  
  return null;
}

/**
 * Extrait les compétences - VERSION AMÉLIORÉE (sans faux positifs)
 */
function extractSkills(text) {
  const commonSkills = {
    // DevOps & Cloud
    'AWS': /aws|amazon web services/i,
    'Azure': /azure|microsoft azure/i,
    'GCP': /gcp|google cloud/i,
    'Docker': /docker/i,
    'Kubernetes': /kubernetes|k8s/i,
    'Jenkins': /jenkins/i,
    'GitLab': /gitlab/i,
    'GitHub': /github/i,
    'Ansible': /ansible/i,
    'Terraform': /terraform/i,
    'Linux': /linux/i,
    'Ubuntu': /ubuntu/i,
    'Debian': /debian/i,
    'RedHat': /redhat|red hat/i,
    
    // Programmation
    'Python': /python/i,
    'Java': /java(?!script)/i,
    'JavaScript': /javascript|js/i,
    'TypeScript': /typescript/i,
    'PHP': /php/i,
    'C++': /c\+\+/i,
    'C#': /c#|c sharp/i,
    'Ruby': /ruby/i,
    'Go': /\bGo\b(?!lang)/i,  // Évite "Google"
    'Bash': /bash/i,
    'PowerShell': /powershell/i,
    
    // Frameworks
    'React': /react/i,
    'Vue': /vue/i,
    'Angular': /angular/i,
    'Node.js': /node\.?js/i,
    'Spring': /spring/i,
    'Django': /django/i,
    'Flask': /flask/i,
    'Laravel': /laravel/i,
    'Symfony': /symfony/i,
    
    // Bases de données
    'SQL': /\bSQL\b(?! server)/i,
    'MySQL': /mysql/i,
    'PostgreSQL': /postgresql|postgre/i,
    'MongoDB': /mongodb|mongo/i,
    'Oracle': /oracle/i,
    'SQL Server': /sql server/i,
    'Elasticsearch': /elasticsearch/i,
    
    // Outils
    'Git': /\bGit\b(?!hub)/i,
    'Jira': /jira/i,
    'Confluence': /confluence/i,
    'ServiceNow': /service now|servicenow/i,
    'SharePoint': /sharepoint/i,
    'Office': /office|excel|word|powerpoint|outlook/i,
    
    // ERP
    'SAP': /sap/i,
    'ERP': /\bERP\b/i,
    'Sylob': /sylob/i,
    'EBP': /\bEBP\b/i,
    'CEGID': /cegid/i,
    'OpenERP': /openerp|odoo/i,
    
    // RH / Commerce
    'Recrutement': /recrutement|sourcing/i,
    'Sourcing': /sourcing/i,
    'ADP': /\bADP\b/i,
    'Paie': /paie|paye/i,
    'CSE': /\bCSE\b/i,
    'NAO': /\bNAO\b/i,
    'Vente': /vente|commercial/i,
    'Relation client': /relation client|client relation/i,
    'Prospection': /prospection/i,
    'Négociation': /négociation|negociation/i,
    
    // Communication
    'Canva': /canva/i,
    'Photoshop': /photoshop/i,
    'WordPress': /wordpress/i,
    'Hootsuite': /hootsuite/i,
    'Réseaux sociaux': /réseaux sociaux|reseaux sociaux|social media/i,
    'Community management': /community management/i
  };
  
  const lowerText = text.toLowerCase();
  const found = new Set();
  
  Object.entries(commonSkills).forEach(([skill, pattern]) => {
    if (pattern.test(lowerText)) {
      found.add(skill);
    }
  });
  
  return Array.from(found);
}

/**
 * Extrait les diplômes - VERSION AMÉLIORÉE
 */
function extractDiplomas(text) {
  const diplomas = [
    { name: 'Bac', patterns: [/bac(?:calauréat)?/i, /bac pro/i] },
    { name: 'BTS', patterns: [/bts/i, /brevet de technicien supérieur/i] },
    { name: 'DUT', patterns: [/dut/i, /diplôme universitaire de technologie/i] },
    { name: 'Licence', patterns: [/licence/i, /bac\+3/i, /L3/i] },
    { name: 'Master', patterns: [/master/i, /bac\+5/i, /M2/i, /M1/i] },
    { name: 'Doctorat', patterns: [/doctorat/i, /phd/i, /thèse/i] },
    { name: 'Ingénieur', patterns: [/ingénieur|ingenieur/i, /diplôme d'ingénieur/i] },
    { name: 'CAP', patterns: [/cap\b(?!tial)/i] },
    { name: 'BEP', patterns: [/bep\b/i] },
    { name: 'BAFA', patterns: [/bafa\b/i] }
  ];
  
  const lowerText = text.toLowerCase();
  const found = new Set();
  
  diplomas.forEach(diploma => {
    diploma.patterns.forEach(pattern => {
      if (pattern.test(lowerText)) {
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
  
  // Compter les expériences
  const experienceSection = text.match(/expériences?\s+professionnelles?/i);
  if (experienceSection) {
    const afterSection = text.substring(experienceSection.index);
    const lines = afterSection.split('\n').slice(0, 50);
    let count = 0;
    
    for (const line of lines) {
      if (line.match(/\d{4}\s*[-–—]\s*(?:\d{4}|aujourd'hui|maintenant|à ce jour)/i)) {
        count++;
      }
    }
    return count > 0 ? count : null;
  }
  
  return null;
}

// ==================== ROUTE PRINCIPALE ====================

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
    const { filePath } = req.body;
    
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
    
    // Niveau = dernier diplôme
    const niveau = diplomes.length > 0 ? diplomes[diplomes.length - 1] : null;

    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;

    const candidateInfo = {
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      competences: competences,
      diplomes: diplomes,
      niveau: niveau,
      annees_experience: annees_experience,
      cv_url: cvUrl,
      cv_filename: fileName,
      fichier: filePath
    };

    console.log("✅ Analyse terminée:", candidateInfo);
    
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