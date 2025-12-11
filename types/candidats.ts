// pages/api/parse.ts - VERSION AMÉLIORÉE POUR TOUS LES FORMATS
import { NextApiRequest, NextApiResponse } from 'next';
import fetch from "node-fetch";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { createWorker } from 'tesseract.js';
import { unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ---------- Regex & helpers ----------
const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneRe = /(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const urlRe   = /\bhttps?:\/\/[^\s)]+/gi;
const nameRe  = /\b([A-ZÉÀÂÄ][a-zéèêëàâäîïôöùûüç'-]+)\s+([A-ZÉÀÂÄ][A-Za-zéèêëàâäîïôöùûüç'-]+)\b/;

function splitName(text: string) {
  const m = text.match(nameRe);
  return { prenom: m?.[1] ?? null, nom: m?.[2] ?? null };
}

function extractLinkedIn(text: string) {
  const m = text.match(/linkedin\.com\/(?:in|pub)\/[a-z0-9\-_%]+/gi);
  return m ? m[0] : null;
}

function unique<T>(arr: T[]) { return Array.from(new Set(arr)); }

function extractCompetencesByDict(text: string, dict: string[]): string[] {
  const low = text.toLowerCase();
  return unique(dict.filter(x => low.includes(x.toLowerCase())));
}

function extractExperiences(text: string) {
  // Amélioration du regex pour détecter différentes formes de dates
  const re = /(\b(19|20)\d{2}\b|\b\d{1,2}\/\d{4}\b)[\s\-–]*(\b(19|20)\d{2}\b|\b\d{1,2}\/\d{4}\b|\bprésent\b|\baujourd'hui\b|\bactuel\b)/gi;
  const out: any[] = [];
  let m;
  
  while ((m = re.exec(text)) !== null) {
    const debut = m[1];
    const fin = m[3];
    const startIndex = Math.max(0, m.index - 100);
    const endIndex = Math.min(text.length, m.index + m[0].length + 300);
    const description = text.substring(startIndex, endIndex).replace(/\s+/g, ' ').trim();
    
    // Essayer d'extraire le poste et l'entreprise
    const lines = description.split('\n');
    let poste = null;
    let entreprise = null;
    
    for (const line of lines) {
      if (!poste && line.match(/[A-Z][a-z]+/)) {
        poste = line.trim();
      }
      if (!entreprise && line.toLowerCase().match(/(s\.a\.|sarl|sas|groupe|company|inc\.|ltd)/)) {
        entreprise = line.trim();
      }
    }
    
    out.push({
      debut: debut ? debut.replace(/^(\d{1,2})\/(\d{4})$/, '$2') : null,
      fin: fin ? fin.replace(/^(\d{1,2})\/(\d{4})$/, '$2') : null,
      poste: poste || null,
      entreprise: entreprise || null,
      description: description.slice(0, 2000)
    });
  }
  
  return out.slice(0, 10); // Limiter à 10 expériences max
}

function extractLangues(text: string) {
  const langs = ['français','anglais','espagnol','allemand','italien','portugais','arabe','chinois','mandarin','japonais','russe','néerlandais','turc','polonais'];
  const levels = ['A1','A2','B1','B2','C1','C2','débutant','intermédiaire','avancé','courant','bilingue','natif','native'];
  const lines = text.split(/\r?\n/);
  const out: any[] = [];
  
  for (const line of lines) {
    const l = langs.find(x => line.toLowerCase().includes(x));
    if (!l) continue;
    const n = levels.find(x => line.toLowerCase().includes(x.toLowerCase())) ?? '';
    if (!out.some(y => y.langue === l && y.niveau === n)) {
      out.push({ langue: l, niveau: n || 'non spécifié' });
    }
  }
  
  return out;
}

// ============ FONCTION UNIQUE POUR LES FORMATIONS ============
function extractFormations(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const formations: any[] = [];
  
  // Patterns améliorés pour détecter les diplômes
  const diplomaPatterns = [
    /(doctorat|phd|doctorat ès|doctorate)/i,
    /(ingénieur|diplôme d'ingénieur|engineering degree)/i,
    /(master 2|m2|master|mastère|msc|ms)/i,
    /(master 1|m1|maîtrise)/i,
    /(licence|bachelor|bac\+3|bachelor's degree)/i,
    /(bts|brevet de technicien supérieur)/i,
    /(dut|diplôme universitaire de technologie)/i,
    /(deug)/i,
    /(baccalauréat|bac pro|bac techno|bac général|bac|high school diploma)/i,
    /(bep|brevet d'études professionnelles)/i,
    /(cap|certificat d'aptitude professionnelle)/i,
    /(brevet|certificat|certificate)/i
  ];
  
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Vérifier si la ligne contient un terme de diplôme ou d'éducation
    const hasDiploma = diplomaPatterns.some(pattern => pattern.test(trimmed)) ||
                      /(diplôme|diplômé|diplomé|diplomée|formation|école|université|faculté|études|education|university|school|college)/i.test(trimmed);
    
    if (hasDiploma && trimmed.length > 5) {
      // Essayer d'extraire l'année
      let annee = null;
      const yearMatch = trimmed.match(/(19|20)\d{2}/);
      if (yearMatch) {
        annee = yearMatch[0];
      }
      
      // Vérifier la ligne suivante pour plus de contexte
      let formationText = trimmed;
      if (index < lines.length - 1 && lines[index + 1].trim().length > 5) {
        formationText += ' ' + lines[index + 1].trim();
      }
      
      formations.push({
        raw: formationText,
        annee: annee,
        ecole: extractEcoleFromFormation(formationText),
        diplome: extractDiplomeFromText(formationText)
      });
    }
  });
  
  return formations.slice(0, 15);
}

function extractEcoleFromFormation(text: string): string | null {
  const ecoles = [
    'université', 'école', 'faculté', 'institut', 'lycée', 'collège',
    'polytechnique', 'centrale', 'mines', 'ponts', 'ens', 'hec', 'essec', 'escp',
    'sciences po', 'sorbonne', 'paris', 'lyon', 'toulouse', 'grenoble', 'montpellier',
    'mit', 'stanford', 'harvard', 'oxford', 'cambridge', 'berkeley', 'caltech'
  ];
  
  for (const ecole of ecoles) {
    const regex = new RegExp(`\\b${ecole}\\b`, 'i');
    const match = text.match(regex);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

function extractDiplomeFromText(text: string): string | null {
  const diplomes = [
    'doctorat', 'phd', 'master', 'licence', 'bachelor', 'bts', 'dut',
    'ingénieur', 'mba', 'maîtrise', 'deug', 'bac', 'baccalauréat'
  ];
  
  for (const diplome of diplomes) {
    const regex = new RegExp(`\\b${diplome}\\b`, 'i');
    const match = text.match(regex);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

// ============ FONCTION EXTRACTION DU NIVEAU AMÉLIORÉE ============
function extractNiveauFromFormations(formations: any[]): string | null {
  if (!formations || formations.length === 0) return null;
  
  const niveauHierarchy: {[key: string]: {score: number, label: string}} = {
    'doctorat': { score: 10, label: 'Doctorat' },
    'phd': { score: 10, label: 'Doctorat' },
    'ingénieur': { score: 9, label: 'Ingénieur' },
    'mba': { score: 9, label: 'MBA' },
    'master 2': { score: 8, label: 'Master' },
    'master': { score: 8, label: 'Master' },
    'mastère': { score: 8, label: 'Master' },
    'm2': { score: 8, label: 'Master' },
    'msc': { score: 8, label: 'Master' },
    'master 1': { score: 7, label: 'Master 1' },
    'm1': { score: 7, label: 'Master 1' },
    'licence': { score: 6, label: 'Licence' },
    'bac+3': { score: 6, label: 'Licence' },
    'bachelor': { score: 6, label: 'Bachelor' },
    'bts': { score: 5, label: 'BTS' },
    'dut': { score: 5, label: 'DUT' },
    'deug': { score: 5, label: 'DEUG' },
    'bac+2': { score: 5, label: 'BAC+2' },
    'baccalauréat': { score: 4, label: 'BAC' },
    'bac': { score: 4, label: 'BAC' },
    'bep': { score: 3, label: 'BEP' },
    'cap': { score: 3, label: 'CAP' },
    'brevet': { score: 2, label: 'Brevet' }
  };
  
  let meilleurNiveau: string | null = null;
  let meilleurScore = 0;
  
  formations.forEach(formation => {
    const rawText = formation.raw?.toLowerCase() || '';
    
    Object.entries(niveauHierarchy).forEach(([motCle, info]) => {
      const regex = new RegExp(`\\b${motCle}\\b`, 'i');
      if (regex.test(rawText)) {
        // Vérifications pour éviter les faux positifs
        if (motCle === 'bachelor' && rawText.includes('bts')) return;
        if (motCle === 'bac' && rawText.includes('baccalaureat')) return;
        if (motCle === 'm1' && rawText.includes('m2')) return;
        if (motCle === 'dut' && rawText.includes('doctorat')) return;
        
        if (info.score > meilleurScore) {
          meilleurScore = info.score;
          meilleurNiveau = info.label;
        }
      }
    });
  });
  
  return meilleurNiveau;
}

// ---------- Dictionnaires améliorés ----------
const competencesDict = [
  "javascript", "typescript", "react", "node", "sql", "python", "docker", "aws", "gcp", "azure",
  "postgresql", "supabase", "mysql", "mongodb", "graphql", "vue", "angular", "express", "nest",
  "java", "spring", "c#", ".net", "php", "laravel", "symfony", "ruby", "rails", "go", "rust",
  "kubernetes", "terraform", "ansible", "jenkins", "git", "github", "gitlab", "ci/cd",
  "react native", "flutter", "swift", "kotlin", "android", "ios", "html", "css", "sass", "less",
  "redux", "vuex", "webpack", "babel", "jest", "cypress", "selenium", "agile", "scrum", "jira"
];

const metiersDict = [
  "développeur", "data engineer", "data scientist", "product manager", "devops", "fullstack",
  "frontend", "backend", "software engineer", "architecte", "cto", "lead developer",
  "mobile developer", "web developer", "cloud engineer", "security engineer", "qa engineer",
  "business analyst", "project manager", "scrum master", "ui/ux designer", "product owner",
  "system administrator", "network engineer", "database administrator", "ai engineer",
  "machine learning engineer", "bi developer", "etl developer", "salesforce developer"
];

const profilsDict = [
  "Ingénieur Logiciel", "Développeur Fullstack", "Chef de projet", "Data Scientist",
  "DevOps Engineer", "Architecte Cloud", "Product Manager", "CTO", "Lead Developer",
  "Mobile Developer", "Web Developer", "QA Engineer", "Business Analyst"
];

// ---------- Fonctions d'extraction de texte ----------
async function fetchArrayBuffer(url: string): Promise<Buffer> {
  console.log("🔗 Téléchargement depuis:", url);
  
  // Vérification de sécurité
  if (!url.includes('supabase.co')) {
    throw new Error('URL non autorisée: doit être une URL Supabase');
  }

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TruthTalent-Parser/1.0',
      'Accept': '*/*'
    }
  });
  
  if (!response.ok) {
    console.error("❌ Erreur téléchargement:", response.status, response.statusText);
    
    if (response.status === 400) throw new Error('URL invalide');
    if (response.status === 403) throw new Error('Accès refusé - vérifiez les permissions');
    if (response.status === 404) throw new Error('Fichier non trouvé');
    
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  console.log("✅ Téléchargement réussi, taille:", buffer.byteLength, "bytes");
  return Buffer.from(buffer);
}

async function extractTextFromBuffer(fileName: string, buffer: Buffer): Promise<string> {
  const ext = fileName.toLowerCase().split('.').pop();
  console.log("📄 Extraction texte, extension:", ext);
  
  // PDF
  if (ext === "pdf") {
    try {
      const data = await pdfParse(buffer);
      console.log("✅ PDF parsé, texte longueur:", data.text?.length || 0);
      return data.text || "";
    } catch (error) {
      console.error("❌ Erreur parsing PDF:", error);
      throw new Error('Erreur lors de l\'extraction du PDF');
    }
  }
  
  // DOCX
  if (ext === "docx" || ext === "doc") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      console.log("✅ DOC/DOCX parsé, texte longueur:", result.value?.length || 0);
      return result.value || "";
    } catch (error) {
      console.error("❌ Erreur parsing DOC/DOCX:", error);
      throw new Error('Erreur lors de l\'extraction du document Word');
    }
  }
  
  // Images (PNG, JPG, JPEG) - OCR avec Tesseract
  if (ext === "png" || ext === "jpg" || ext === "jpeg") {
    try {
      console.log("🖼️ Début de l'OCR pour image...");
      
      // Sauvegarder le buffer temporairement
      const tempPath = join(tmpdir(), `ocr_${Date.now()}.${ext}`);
      writeFileSync(tempPath, buffer);
      
      // Créer un worker Tesseract
      const worker = await createWorker('fra+eng'); // Français + Anglais
      
      try {
        const { data: { text } } = await worker.recognize(tempPath);
        console.log("✅ OCR réussi, texte longueur:", text?.length || 0);
        
        // Nettoyer
        await worker.terminate();
        unlinkSync(tempPath);
        
        return text || "";
      } catch (ocrError) {
        await worker.terminate();
        unlinkSync(tempPath);
        throw ocrError;
      }
    } catch (error) {
      console.error("❌ Erreur OCR:", error);
      throw new Error('Erreur lors de l\'OCR de l\'image');
    }
  }
  
  // Essayer comme texte brut
  try {
    const text = buffer.toString("utf8");
    if (text.length > 10) {
      console.log("✅ Texte brut extrait, longueur:", text.length);
      return text;
    }
  } catch (error) {
    // Continuer si l'UTF-8 échoue
  }
  
  throw new Error(`Format non supporté: ${ext}`);
}

// ---------- Fonction principale d'analyse ----------
async function analyzeText(text: string, fileName: string) {
  console.log("🧠 Analyse du texte, longueur:", text.length);
  
  // Nettoyage initial du texte
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  // Extraction des données
  const { nom, prenom } = splitName(cleanText);
  const email = (cleanText.match(emailRe) ?? [null])[0];
  const telephone = (cleanText.match(phoneRe) ?? [null])[0]?.replace(/\s+/g, '') ?? null;
  const links = unique(cleanText.match(urlRe) ?? []);
  const linkedin = extractLinkedIn(cleanText);
  const competences = extractCompetencesByDict(cleanText, competencesDict);
  const metiers = extractCompetencesByDict(cleanText, metiersDict);
  const experiences = extractExperiences(cleanText);
  const formations = extractFormations(cleanText);
  const niveau = extractNiveauFromFormations(formations);
  const langues = extractLangues(cleanText);
  
  // Essayer d'extraire le poste actuel
  let poste = null;
  let entreprise = null;
  
  // Chercher le poste dans les premières lignes
  const firstLines = cleanText.split('\n').slice(0, 10).join(' ');
  const postePatterns = [
    /(développeur|engineer|manager|analyst|consultant|designer|architect|director|lead|senior|junior)\s+([a-z]+)/i,
    /(chez|at)\s+([A-Z][a-zA-Z\s&]+)/i
  ];
  
  for (const pattern of postePatterns) {
    const match = firstLines.match(pattern);
    if (match) {
      if (!poste && match[1]) poste = match[0].trim();
      if (!entreprise && match[2]) entreprise = match[2].trim();
    }
  }
  
  // Essayer d'extraire l'adresse
  let adresse = null;
  const addressMatch = cleanText.match(/\d{1,5}\s+[A-Za-z\s,]+(?:,\s*)?(?:[A-Za-z\s]+)?\s+\d{5}\s+[A-Za-z\s]+/);
  if (addressMatch) {
    adresse = addressMatch[0].trim();
  }
  
  // Déterminer le profil le plus probable
  let profil = profilsDict[0];
  if (metiers.length > 0) {
    const metier = metiers[0];
    const profilMap: {[key: string]: string} = {
      'développeur': 'Développeur Fullstack',
      'data scientist': 'Data Scientist',
      'devops': 'DevOps Engineer',
      'product manager': 'Product Manager'
    };
    profil = profilMap[metier.toLowerCase()] || `${metier.charAt(0).toUpperCase() + metier.slice(1)}`;
  }
  
  const payload = {
    fichier: fileName,
    nom, 
    prenom, 
    email, 
    telephone, 
    adresse,
    poste, 
    entreprise, 
    profil,
    linkedin,
    competences: competences.slice(0, 20), // Limiter à 20 compétences
    metiers: metiers.slice(0, 5), // Limiter à 5 métiers
    links: links.slice(0, 10), // Limiter à 10 liens
    experiences: experiences,
    formations: formations,
    niveau,
    langues,
    raw_text: cleanText.substring(0, 2000), // Garder 2000 caractères max
    extraction_date: new Date().toISOString(),
    file_type: fileName.split('.').pop()?.toLowerCase()
  };

  console.log("✅ Analyse complétée:", { 
    name: `${prenom || ''} ${nom || ''}`.trim(), 
    email, 
    skills: competences.length,
    niveau: niveau || 'Non détecté',
    formations: formations.length,
    experiences: experiences.length
  });

  return payload;
}

// ---------- Handler principal ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("🔍 API Parse called - Method:", req.method);
  
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    console.log("🔄 Préflight CORS");
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file_url, file_name } = req.body as { file_url: string; file_name: string };
    
    console.log("📦 Request reçue pour:", { 
      file_name,
      file_url_length: file_url?.length || 0,
      timestamp: new Date().toISOString()
    });

    if (!file_url || !file_name) {
      console.log("❌ Paramètres manquants");
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ 
        error: "Paramètres requis manquants",
        required: ["file_url", "file_name"]
      });
    }

    // Vérifier le format du fichier
    const ext = file_name.toLowerCase().split('.').pop();
    const supportedFormats = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    
    if (!ext || !supportedFormats.includes(ext)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ 
        error: "Format de fichier non supporté",
        supported_formats: supportedFormats,
        received_format: ext || 'inconnu'
      });
    }

    console.log("⬇️ Téléchargement du fichier...");
    const buffer = await fetchArrayBuffer(file_url);

    if (buffer.length === 0) {
      throw new Error("Fichier vide ou corrompu");
    }

    console.log("🔤 Extraction du texte...");
    const text = await extractTextFromBuffer(file_name, buffer);
    
    if (!text || text.length < 10) {
      console.log("❌ Pas de texte extrait");
      throw new Error("Impossible d'extraire du texte du fichier");
    }

    console.log("🧪 Analyse du texte extrait...");
    const analyzedData = await analyzeText(text, file_name);

    // Réponse réussie
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
    
    res.json({ 
      ok: true, 
      data: analyzedData,
      metadata: {
        text_length: text.length,
        extraction_time: new Date().toISOString(),
        file_format: ext
      }
    });

  } catch (error: any) {
    console.error("💥 Erreur API Parse:", {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
    
    res.status(500).json({ 
      ok: false, 
      error: error.message || 'Erreur interne du serveur',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
}