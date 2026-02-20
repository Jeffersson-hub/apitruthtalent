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

function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0160\u0161\u017D\u017E\u2018\u2019\u201C\u201D\u2026]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/===== Page \d+ =====/g, '')
    .replace(/\d+\s+\d+\s+\d+[\s\d]*/g, '')
    .trim();
}

/**
 * Extrait le nom et prénom - VERSION CORRIGÉE
 */
function extractName(text, fileName) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  
  // Liste des mots à ignorer dans les noms
  const ignoreWords = ['cv', 'curriculum', 'vitae', 'résumé', 'resume', 'page', 'contact', 'email', 'téléphone', 'adresse'];
  
  // 1. Chercher dans les 20 premières lignes
  for (const line of lines.slice(0, 20)) {
    const cleanLine = line.trim().replace(/^#+\s*/, ''); // Enlève les #
    
    // Éviter les lignes trop longues ou avec des mots-clés
    if (cleanLine.length > 50 || ignoreWords.some(word => cleanLine.toLowerCase().includes(word))) {
      continue;
    }
    
    // Pattern: Prénom Nom (ex: "Jean-François Boisgontier" ou "TETYANA SAYENKO")
    const matchPrenomNom = cleanLine.match(/^([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)\s+([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)$/);
    if (matchPrenomNom && !matchPrenomNom[1].includes(',')) {
      return {
        prenom: matchPrenomNom[1].trim(),
        nom: matchPrenomNom[2].trim()
      };
    }
    
    // Pattern: NOM Prénom (ex: "BOISGONTIER Jean-François")
    const matchNomPrenom = cleanLine.match(/^([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)\s+([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)$/);
    if (matchNomPrenom && !matchNomPrenom[1].includes(',')) {
      return {
        prenom: matchNomPrenom[2].trim(),
        nom: matchNomPrenom[1].trim()
      };
    }
  }
  
  // 2. Fallback intelligent sur nom de fichier
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  const cleanFileName = fileNameWithoutExt
    .replace(/CV[_-]?/gi, '')
    .replace(/[_-]/g, ' ')
    .replace(/\d+/g, '')
    .replace(/fr|vendeuse|poste|stage|alternance|cdi|cdd/gi, '') // Enlève les mots courants
    .trim();
  
  const nameParts = cleanFileName.split(' ').filter(p => p.length > 2); // Ignore les mots trop courts
  
  if (nameParts.length >= 2) {
    // Si la première partie est en majuscules, c'est le nom
    if (nameParts[0] === nameParts[0].toUpperCase() && nameParts[0].length > 1) {
      return {
        nom: nameParts[0],
        prenom: nameParts.slice(1).join(' ')
      };
    } 
    // Si la dernière partie est en majuscules, c'est le nom
    else if (nameParts[nameParts.length-1] === nameParts[nameParts.length-1].toUpperCase()) {
      return {
        prenom: nameParts.slice(0, -1).join(' '),
        nom: nameParts[nameParts.length-1]
      };
    }
    // Sinon, première partie = prénom, reste = nom
    else {
      return {
        prenom: nameParts[0],
        nom: nameParts.slice(1).join(' ')
      };
    }
  } else if (nameParts.length === 1) {
    return {
      prenom: nameParts[0],
      nom: null
    };
  }
  
  return { prenom: null, nom: null };
}

function extractEmail(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = text.match(emailRegex);
  
  if (emails && emails.length > 0) {
    const validEmail = emails.find(e => 
      !e.includes('example') && 
      !e.includes('test') && 
      !e.includes('nom') &&
      !e.includes('email') &&
      e.includes('.')
    );
    return validEmail || emails[0];
  }
  return null;
}

function extractPhone(text) {
  const phoneRegex = /(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/g;
  const phones = text.match(phoneRegex);
  
  if (phones && phones.length > 0) {
    return phones[0].replace(/[\s.-]/g, '');
  }
  return null;
}

/**
 * Extrait les compétences - VERSION AVEC CONTEXTE
 */
function extractSkills(text) {
  const commonSkills = {
    // DevOps & Cloud - UNIQUEMENT si contexte technique
    'AWS': /\bAWS\b|\bAmazon Web Services\b/i,
    'Azure': /\bAzure\b|\bMicrosoft Azure\b/i,
    'GCP': /\bGCP\b|\bGoogle Cloud\b/i,
    'Docker': /\bDocker\b/i,
    'Kubernetes': /\bKubernetes\b|\bK8s\b/i,
    'Jenkins': /\bJenkins\b/i,
    'GitLab': /\bGitLab\b/i,
    'GitHub': /\bGitHub\b/i,
    'Ansible': /\bAnsible\b/i,
    'Terraform': /\bTerraform\b/i,
    'Linux': /\bLinux\b/i,
    
    // Programmation - UNIQUEMENT si contexte technique
    'Python': /\bPython\b(?!\s+pour)/i,
    'Java': /\bJava\b(?!\s+script)/i,
    'JavaScript': /\bJavaScript\b|\bJS\b(?!\s+on)/i,
    'TypeScript': /\bTypeScript\b/i,
    'PHP': /\bPHP\b/i,
    'C++': /\bC\+\+\b/i,
    'C#': /\bC#\b|\bC Sharp\b/i,
    'Ruby': /\bRuby\b(?!\s+on)/i,
    'Go': /\bGo\b(?!\s+lang|\s+to|\s+and|\s+in)/i, // Évite "Go to", "Go and"
    'Bash': /\bBash\b/i,
    'PowerShell': /\bPowerShell\b/i,
    
    // Frameworks
    'React': /\bReact\b(?!\s+js)/i,
    'Vue': /\bVue\.?\s*[.]?js\b|\bVue\b(?!\s+de)/i,
    'Angular': /\bAngular\b/i,
    'Node.js': /\bNode\.?js\b|\bNode\b(?!\s+js)/i,
    'Spring': /\bSpring\b(?!\s+boot)/i,
    
    // Bases de données
    'SQL': /\bSQL\b(?!\s+injection)/i,
    'MySQL': /\bMySQL\b/i,
    'PostgreSQL': /\bPostgreSQL\b|\bPostgre\b/i,
    'MongoDB': /\bMongoDB\b|\bMongo\b/i,
    'Oracle': /\bOracle\b(?!\s+cloud)/i,
    'SQL Server': /\bSQL Server\b/i,
    
    // Outils - PLUS PRÉCIS
    'Git': /\bGit\b(?!\s+hub)/i,
    'Jira': /\bJira\b/i,
    'Confluence': /\bConfluence\b/i,
    'ServiceNow': /\bServiceNow\b|\bService Now\b/i,
    'SharePoint': /\bSharePoint\b/i,
    'Office': /\b(?:Microsoft\s+)?Office\b|\bExcel\b|\bWord\b|\bPowerPoint\b|\bOutlook\b/i,
    
    // ERP
    'SAP': /\bSAP\b(?!\s+)\b/i,
    'ERP': /\bERP\b(?!\s+)\b/i,
    'Sylob': /\bSylob\b/i,
    'EBP': /\bEBP\b/i,
    'CEGID': /\bCEGID\b/i,
    
    // RH / Commerce
    'Recrutement': /\bRecrutement\b|\bSourcing\b/i,
    'Sourcing': /\bSourcing\b/i,
    'ADP': /\bADP\b(?!\s+)\b/i,
    'Paie': /\bPaie\b|\bPaye\b/i,
    'CSE': /\bCSE\b(?!\s+)\b/i,
    'NAO': /\bNAO\b(?!\s+)\b/i,
    'Vente': /\bVente\b|\bCommercial\b/i,
    'Relation client': /\bRelation\s+client\b/i,
    'Prospection': /\bProspection\b/i,
    'Négociation': /\bNégociation\b|\bNegociation\b/i,
    
    // Communication
    'Canva': /\bCanva\b/i,
    'Photoshop': /\bPhotoshop\b/i,
    'WordPress': /\bWordPress\b/i,
    'Hootsuite': /\bHootsuite\b/i,
    'Réseaux sociaux': /\bRéseaux?\s+sociaux?\b|\bSocial media\b/i,
  };
  
  const lowerText = text.toLowerCase();
  const found = new Set();
  
  // Détecter le contexte du CV
  const isTechnical = /\b(ingénieur|développeur|devops|sysops|infrastructure|programmation|code)\b/i.test(lowerText);
  const isRH = /\b(rh|ressources humaines|recrutement|paie|administration du personnel)\b/i.test(lowerText);
  const isCommercial = /\b(vente|commercial|client|prospection|négociation)\b/i.test(lowerText);
  const isCommunication = /\b(communication|réseaux sociaux|marketing|community)\b/i.test(lowerText);
  
  Object.entries(commonSkills).forEach(([skill, pattern]) => {
    if (pattern.test(lowerText)) {
      // Filtrer selon le contexte
      if (skill === 'JavaScript' && !isTechnical) return;
      if (skill === 'Go' && !isTechnical) return;
      if (skill === 'Git' && !isTechnical) return;
      if (skill === 'Docker' && !isTechnical) return;
      
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
    { name: 'Bac', patterns: [/bac(?:calauréat)?(?!\s+pro)/i, /bac pro/i] },
    { name: 'BTS', patterns: [/bts\b/i, /brevet de technicien supérieur/i] },
    { name: 'DUT', patterns: [/dut\b/i] },
    { name: 'Licence', patterns: [/licence\b/i, /bac\+3/i, /L3\b/i] },
    { name: 'Master', patterns: [/master\b/i, /bac\+5/i, /M2\b/i, /M1\b/i] },
    { name: 'Doctorat', patterns: [/doctorat\b/i, /phd\b/i] },
    { name: 'Ingénieur', patterns: [/ingénieur\b(?!.*junior)/i] },
    { name: 'CAP', patterns: [/cap\b(?!itale)/i] },
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

function extractExperience(text) {
  const patterns = [
    /(\d+)\s*(?:ans?|années?)\s*d['']?expérience/i,
    /expérience\s*(?:de\s*)?(\d+)\s*(?:ans?|années?)/i,
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
      if (line.match(/formations?\s*:/i)) break;
    }
    return count > 0 ? count : null;
  }
  
  return null;
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

    console.log(`📥 Analyse: ${filePath}`);

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
    const rawText = await extractTextFromFile(fileBuffer, fileName);
    const text = cleanText(rawText);
    
    console.log(`✅ Texte extrait: ${text.length} caractères`);

    const { prenom, nom } = extractName(text, fileName);
    const email = extractEmail(text);
    const telephone = extractPhone(text);
    const competences = extractSkills(text);
    const diplomes = extractDiplomas(text);
    const annees_experience = extractExperience(text);
    
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