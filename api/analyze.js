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
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  MIN_TEXT_LENGTH: 100,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  METIERS_DATABASE: [
    { pattern: /ingénieur\s+(?:devops|système|réseau|logiciel|développement)/i, value: "Ingénieur DevOps" },
    { pattern: /ingénieur\s+(?:informatique|logiciel|développement)/i, value: "Ingénieur Logiciel" },
    { pattern: /développeur\s+(?:full[ -]stack|web|mobile|back[ -]end|front[ -]end)/i, value: "Développeur" },
    { pattern: /data\s+(?:scientist|analyst|engineer)/i, value: "Data" },
    { pattern: /chef\s+de\s+projet|project\s+manager/i, value: "Chef de Projet" },
    { pattern: /product\s+(?:owner|manager)/i, value: "Product" },
    { pattern: /charg[ée]\s+(?:de\s+)?recrutement|recruteur|sourcing/i, value: "Recruteur" },
    { pattern: /charg[ée]\s+(?:des\s+)?ressources\s+humaines|charg[ée]\s+rh/i, value: "Chargé RH" },
    { pattern: /assistant[ée]\s+rh/i, value: "Assistant RH" },
    { pattern: /responsable\s+rh/i, value: "Responsable RH" },
    { pattern: /commercial|charg[ée]\s+de\s+clientèle|conseiller\s+de\s+vente|vendeur|vendeuse/i, value: "Commercial" },
    { pattern: /responsable\s+commercial/i, value: "Responsable Commercial" },
    { pattern: /marketing|community\s+manager|charg[ée]\s+de\s+communication/i, value: "Marketing / Communication" },
    { pattern: /administrateur\s+(?:système|réseau)/i, value: "Administrateur Système" },
    { pattern: /technicien\s+(?:informatique|support|réseau)/i, value: "Technicien" },
    { pattern: /support\s+(?:informatique|technique)/i, value: "Support Technique" }
  ]
};

// ==================== FONCTIONS D'EXTRACTION ====================

function extractName(text, fileName) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  const ignoreWords = ['cv', 'curriculum', 'vitae', 'résumé', 'resume', 'page', 'contact', 'email', 'téléphone'];
  
  for (const line of lines.slice(0, 20)) {
    const cleanLine = line.trim().replace(/^#+\s*/, '');
    if (cleanLine.length > 50 || ignoreWords.some(word => cleanLine.toLowerCase().includes(word))) continue;
    
    const matchPrenomNom = cleanLine.match(/^([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)\s+([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)$/);
    if (matchPrenomNom) return { prenom: matchPrenomNom[1].trim(), nom: matchPrenomNom[2].trim() };
    
    const matchNomPrenom = cleanLine.match(/^([A-ZÀ-Ÿ]{2,}(?:[- ][A-ZÀ-Ÿ]{2,})*)\s+([A-ZÀ-Ÿ][a-zà-ÿ'-]+(?:[- ][A-ZÀ-Ÿ][a-zà-ÿ'-]+)*)$/);
    if (matchNomPrenom) return { prenom: matchNomPrenom[2].trim(), nom: matchNomPrenom[1].trim() };
  }
  return { prenom: null, nom: null };
}

function extractEmail(text) {
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return emails ? emails[0] : null;
}

function extractPhone(text) {
  const phones = text.match(/(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/g);
  return phones ? phones[0].replace(/[\s.-]/g, '') : null;
}

function extractJobTitle(text) {
  const lines = text.split('\n').slice(0, 30);
  for (const line of lines) {
    const cleanLine = line.trim().replace(/^#+\s*/, '').replace(/\*\*/g, '');
    if (cleanLine.length < 10 || cleanLine.length > 100) continue;
    for (const metier of CONFIG.METIERS_DATABASE) {
      if (metier.pattern.test(cleanLine)) return metier.value;
    }
  }
  return null;
}

function extractExperience(text) {
  const patterns = [
    /(\d+)\s*(?:ans?|années?)\s*d['']?expérience/i,
    /expérience\s*(?:de\s*)?(\d+)\s*(?:ans?|années?)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  return null;
}

function extractDiplomas(text) {
  const diplomas = [
    { name: 'Bac', patterns: [/bac(?:calauréat)?/i] },
    { name: 'BTS', patterns: [/bts\b/i] },
    { name: 'DUT', patterns: [/dut\b/i] },
    { name: 'Licence', patterns: [/licence\b|bac\+3/i] },
    { name: 'Master', patterns: [/master\b|bac\+5/i] },
    { name: 'Ingénieur', patterns: [/ingénieur\b(?!.*junior)/i] },
    { name: 'Doctorat', patterns: [/doctorat\b|phd\b/i] },
    { name: 'CAP', patterns: [/cap\b(?!itale)/i] },
    { name: 'BEP', patterns: [/bep\b/i] },
    { name: 'BAFA', patterns: [/bafa\b/i] }
  ];
  
  const found = [];
  diplomas.forEach(d => {
    d.patterns.forEach(p => {
      if (p.test(text)) found.push(d.name);
    });
  });
  return [...new Set(found)];
}

function getExperienceLevel(years) {
  if (!years || years < 0) return "junior";
  if (years < 3) return "junior";
  if (years < 7) return "confirmé";
  return "senior";
}

function extractSkills(text) {
  const commonSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'PHP', 'Ruby', 'Go',
    'React', 'Angular', 'Vue', 'Node.js', 'SQL', 'MySQL', 'PostgreSQL',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Git', 'Linux',
    'Communication', 'Travail d\'équipe', 'Autonomie', 'Gestion du temps',
    'Recrutement', 'Sourcing', 'ADP', 'Paie', 'CSE', 'NAO',
    'Vente', 'Prospection', 'Négociation', 'Relation client',
    'Canva', 'WordPress', 'Réseaux sociaux'
  ];
  
  const found = [];
  const lowerText = text.toLowerCase();
  commonSkills.forEach(skill => {
    if (lowerText.includes(skill.toLowerCase())) found.push(skill);
  });
  return found;
}

async function extractTextFromFile(fileBuffer, fileName) {
  const fileType = fileName.split('.').pop().toLowerCase();
  if (fileType === 'pdf') {
    const data = await pdfParse(Buffer.from(fileBuffer));
    return data.text;
  } else if (fileType === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
    return value;
  }
  throw new Error(`Format non supporté: ${fileType}`);
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

    // Télécharger le fichier
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !file) {
      return res.status(404).json({ success: false, error: "Fichier introuvable" });
    }

    // Extraire le texte
    const fileBuffer = await file.arrayBuffer();
    const fileName = filePath.split('/').pop();
    const text = await extractTextFromFile(fileBuffer, fileName);

    // Extraire les informations
    const { prenom, nom } = extractName(text, fileName);
    const email = extractEmail(text);
    const telephone = extractPhone(text);
    const metiers = extractJobTitle(text);
    const annees_experience = extractExperience(text);
    const diplomes = extractDiplomas(text);
    const niveau = diplomes.length > 0 ? diplomes[0] : null;
    const niveau_experience = getExperienceLevel(annees_experience);
    const competences = extractSkills(text);

    const cvUrl = `${supabaseUrl}/storage/v1/object/public/truthtalent/${filePath}`;

    // Construction de la réponse
    const candidateInfo = {
      nom,
      prenom,
      email,
      telephone,
      metiers,
      competences,
      diplomes,
      niveau,
      annees_experience: annees_experience || 0,
      niveau_experience,
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