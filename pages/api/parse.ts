// pages/api/parse.ts - VERSION OPTIMISÉE POUR VERCEL
import { NextApiRequest, NextApiResponse } from 'next';
import fetch from "node-fetch";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { createWorker, Worker } from 'tesseract.js';


// ---------- Types ----------
interface Experience {
  debut: string | null;
  fin: string | null;
  poste: string | null;
  entreprise: string | null;
  description: string;
}

interface Formation {
  raw: string;
  annee: string | null;
  ecole: string | null;
  diplome: string | null;
}

interface Langue {
  langue: string;
  niveau: string;
}

interface ParsedData {
  fichier: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  poste: string | null;
  entreprise: string | null;
  profil: string;
  linkedin: string | null;
  competences: string[];
  metiers: string[];
  links: string[];
  experiences: Experience[];
  formations: Formation[];
  niveau: string | null;
  langues: Langue[];
  raw_text: string;
  extraction_date: string;
  file_type: string | undefined;
}

// ---------- Regex patterns ----------
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_REGEX = /(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const URL_REGEX = /\bhttps?:\/\/[^\s)]+/gi;
const NAME_REGEX = /\b([A-ZÉÀÂÄ][a-zéèêëàâäîïôöùûüç'-]+)\s+([A-ZÉÀÂÄ][A-Za-zéèêëàâäîïôöùûüç'-]+)\b/;

// ---------- Helper functions ----------
function splitName(text: string): { prenom: string | null; nom: string | null } {
  const match = text.match(NAME_REGEX);
  return { prenom: match?.[1] ?? null, nom: match?.[2] ?? null };
}

function extractLinkedIn(text: string): string | null {
  const match = text.match(/linkedin\.com\/(?:in|pub)\/[a-z0-9\-_%]+/gi);
  return match ? match[0] : null;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function extractCompetencesByDict(text: string, dict: string[]): string[] {
  const lowercaseText = text.toLowerCase();
  return unique(dict.filter(skill => lowercaseText.includes(skill.toLowerCase())));
}

function extractExperiences(text: string): Experience[] {
  const experiences: Experience[] = [];
  const experiencePatterns = [
    /(\b(19|20)\d{2}\b)[\s\-–]+(\b(19|20)\d{2}\b|\bprésent\b)/gi,
    /(\b\d{1,2}\/\d{4}\b)[\s\-–]+(\b\d{1,2}\/\d{4}\b|\bprésent\b)/gi,
  ];

  for (const pattern of experiencePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const startIndex = Math.max(0, match.index - 50);
      const endIndex = Math.min(text.length, match.index + match[0].length + 200);
      const context = text.substring(startIndex, endIndex).replace(/\s+/g, ' ').trim();
      
      // Extraire le poste et l'entreprise
      const lines = context.split('\n').filter(l => l.trim().length > 3);
      let poste = null;
      let entreprise = null;
      
      for (const line of lines) {
        if (!poste && line.match(/[A-Z][a-z]+.*[A-Z][a-z]+/)) {
          poste = line.trim();
        }
        if (!entreprise && line.toLowerCase().match(/(s\.a\.|sarl|sas|groupe|company|inc\.|ltd)/)) {
          entreprise = line.trim();
        }
      }
      
      experiences.push({
        debut: match[1]?.replace(/^(\d{1,2})\/(\d{4})$/, '$2') || null,
        fin: match[3]?.replace(/^(\d{1,2})\/(\d{4})$/, '$2') || 'présent',
        poste,
        entreprise,
        description: context.slice(0, 1000)
      });
      
      if (experiences.length >= 10) break; // Limiter à 10 expériences
    }
  }
  
  return experiences;
}

function extractFormations(text: string): Formation[] {
  const formations: Formation[] = [];
  const lines = text.split('\n').filter(line => line.trim().length > 5);
  
  const diplomaKeywords = [
    'doctorat', 'phd', 'ingénieur', 'master', 'm2', 'm1', 'licence', 
    'bachelor', 'bts', 'dut', 'deug', 'bac', 'baccalauréat', 'bep', 'cap'
  ];
  
  const schoolKeywords = [
    'université', 'école', 'faculté', 'institut', 'polytechnique', 
    'centrale', 'mines', 'hec', 'essec', 'escp', 'sciences po', 'sorbonne'
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    // Vérifier si la ligne contient un mot-clé de diplôme
    const hasDiplomaKeyword = diplomaKeywords.some(keyword => line.includes(keyword));
    const hasSchoolKeyword = schoolKeywords.some(keyword => line.includes(keyword));
    
    if (hasDiplomaKeyword || hasSchoolKeyword) {
      let formationText = lines[i].trim();
      
      // Ajouter la ligne suivante si elle existe et semble liée
      if (i < lines.length - 1) {
        const nextLine = lines[i + 1].trim();
        if (nextLine.length > 3 && !nextLine.match(/^\d/)) {
          formationText += ' ' + nextLine;
        }
      }
      
      const yearMatch = formationText.match(/(19|20)\d{2}/);
      const ecole = schoolKeywords.find(keyword => formationText.toLowerCase().includes(keyword));
      const diplome = diplomaKeywords.find(keyword => formationText.toLowerCase().includes(keyword));
      
      formations.push({
        raw: formationText,
        annee: yearMatch ? yearMatch[0] : null,
        ecole: ecole ? ecole.charAt(0).toUpperCase() + ecole.slice(1) : null,
        diplome: diplome ? diplome.charAt(0).toUpperCase() + diplome.slice(1) : null
      });
      
      if (formations.length >= 5) break; // Limiter à 5 formations
    }
  }
  
  return formations;
}

function extractNiveauFromFormations(formations: Formation[]): string | null {
  if (formations.length === 0) return null;
  
  const niveauScores: { [key: string]: number } = {
    'doctorat': 100,
    'phd': 100,
    'ingénieur': 90,
    'master': 80,
    'm2': 80,
    'm1': 70,
    'licence': 60,
    'bachelor': 60,
    'bts': 50,
    'dut': 50,
    'deug': 40,
    'bac': 30,
    'baccalauréat': 30,
    'bep': 20,
    'cap': 10
  };
  
  let bestScore = 0;
  let bestNiveau: string | null = null;
  
  formations.forEach(formation => {
    const rawText = formation.raw.toLowerCase();
    
    Object.entries(niveauScores).forEach(([niveau, score]) => {
      if (rawText.includes(niveau) && score > bestScore) {
        bestScore = score;
        bestNiveau = niveau.charAt(0).toUpperCase() + niveau.slice(1);
      }
    });
  });
  
  return bestNiveau;
}

function extractLangues(text: string): Langue[] {
  const langues: Langue[] = [];
  const languages = [
    'français', 'anglais', 'espagnol', 'allemand', 'italien', 
    'portugais', 'arabe', 'chinois', 'japonais', 'russe'
  ];
  
  const niveauKeywords = ['courant', 'bilingue', 'natif', 'expérimenté', 'intermédiaire', 'débutant'];
  
  text.split('\n').forEach(line => {
    const lowercaseLine = line.toLowerCase();
    
    languages.forEach(lang => {
      if (lowercaseLine.includes(lang)) {
        let niveau = 'non spécifié';
        niveauKeywords.forEach(niv => {
          if (lowercaseLine.includes(niv)) {
            niveau = niv;
          }
        });
        
        // Éviter les doublons
        if (!langues.some(l => l.langue === lang)) {
          langues.push({ langue: lang, niveau });
        }
      }
    });
  });
  
  return langues.slice(0, 5); // Limiter à 5 langues
}

// ---------- Text extraction functions ----------
async function fetchFileBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TruthTalent-Parser/2.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Échec du téléchargement: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('Erreur PDF parsing:', error);
    throw new Error('Impossible de parser le PDF');
  }
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (error) {
    console.error('Erreur DOCX parsing:', error);
    throw new Error('Impossible de parser le document Word');
  }
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  let worker: Worker | null = null;
  
  try {
    console.log('Initialisation OCR...');
    worker = await createWorker('fra+eng');
    
    const { data: { text } } = await worker.recognize(buffer);
    return text || '';
  } catch (error) {
    console.error('Erreur OCR:', error);
    throw new Error('Échec de l\'OCR sur l\'image');
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

async function extractTextFromBuffer(fileName: string, buffer: Buffer): Promise<string> {
  const extension = fileName.toLowerCase().split('.').pop();
  
  switch (extension) {
    case 'pdf':
      return await extractTextFromPDF(buffer);
    
    case 'docx':
    case 'doc':
      return await extractTextFromDocx(buffer);
    
    case 'png':
    case 'jpg':
    case 'jpeg':
      return await extractTextFromImage(buffer);
    
    default:
      // Essayer comme texte brut
      try {
        return buffer.toString('utf-8');
      } catch {
        throw new Error(`Format non supporté: ${extension}`);
      }
  }
}

// ---------- Main analysis function ----------
async function analyzeText(text: string, fileName: string): Promise<ParsedData> {
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  const { nom, prenom } = splitName(cleanText);
  const emailMatches = cleanText.match(EMAIL_REGEX);
  const phoneMatches = cleanText.match(PHONE_REGEX);
  const urlMatches = cleanText.match(URL_REGEX);
  
  const email = emailMatches ? emailMatches[0] : null;
  const telephone = phoneMatches ? phoneMatches[0].replace(/\s/g, '') : null;
  const links = unique(urlMatches || []);
  const linkedin = extractLinkedIn(cleanText);
  
  // Compétences et métiers
  const competencesDict = [
    'javascript', 'typescript', 'react', 'node', 'python', 'java', 'c#', 'php',
    'sql', 'mysql', 'postgresql', 'mongodb', 'docker', 'kubernetes', 'aws', 'azure',
    'git', 'github', 'gitlab', 'html', 'css', 'sass', 'vue', 'angular', 'express',
    'nestjs', 'spring', 'laravel', 'symfony'
  ];
  
  const metiersDict = [
    'développeur', 'ingénieur', 'data scientist', 'devops', 'fullstack', 'frontend',
    'backend', 'software engineer', 'architecte', 'chef de projet', 'product manager',
    'consultant', 'analyste', 'designer'
  ];
  
  const competences = extractCompetencesByDict(cleanText, competencesDict);
  const metiers = extractCompetencesByDict(cleanText, metiersDict);
  
  // Autres données
  const experiences = extractExperiences(cleanText);
  const formations = extractFormations(cleanText);
  const niveau = extractNiveauFromFormations(formations);
  const langues = extractLangues(cleanText);
  
  // Déterminer le poste et entreprise
  let poste = null;
  let entreprise = null;
  
  // Chercher dans les premières lignes
  const firstLines = cleanText.split('\n').slice(0, 5).join(' ');
  const posteMatch = firstLines.match(/(développeur|ingénieur|consultant|manager)\s+([a-z]+)/i);
  const entrepriseMatch = firstLines.match(/(chez|at|@)\s+([A-Z][a-zA-Z\s&]+)/i);
  
  if (posteMatch) poste = posteMatch[0];
  if (entrepriseMatch && entrepriseMatch[2]) entreprise = entrepriseMatch[2].trim();
  
  // Profil par défaut
  let profil = 'Candidat';
  if (metiers.length > 0) {
    profil = metiers[0].charAt(0).toUpperCase() + metiers[0].slice(1);
  }
  
  return {
    fichier: fileName,
    nom,
    prenom,
    email,
    telephone,
    adresse: null, // À améliorer si nécessaire
    poste,
    entreprise,
    profil,
    linkedin,
    competences: competences.slice(0, 15),
    metiers: metiers.slice(0, 5),
    links: links.slice(0, 10),
    experiences: experiences.slice(0, 10),
    formations: formations.slice(0, 5),
    niveau,
    langues: langues.slice(0, 5),
    raw_text: cleanText.substring(0, 2000),
    extraction_date: new Date().toISOString(),
    file_type: fileName.split('.').pop()?.toLowerCase()
  };
}

// ---------- API Handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('📥 Requête reçue pour parse API');
    
    const { file_url, file_name } = req.body;
    
    if (!file_url || !file_name) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ 
        error: 'Paramètres manquants',
        details: 'file_url et file_name sont requis'
      });
    }
    
    // Vérifier le format du fichier
    const extension = file_name.toLowerCase().split('.').pop();
    const supportedFormats = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
    
    if (!extension || !supportedFormats.includes(extension)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ 
        error: 'Format non supporté',
        supported_formats: supportedFormats,
        received_format: extension
      });
    }
    
    // Télécharger le fichier
    console.log(`⬇️  Téléchargement de ${file_name}...`);
    const buffer = await fetchFileBuffer(file_url);
    
    if (buffer.length === 0) {
      throw new Error('Fichier vide');
    }
    
    // Extraire le texte
    console.log(`🔤 Extraction du texte depuis ${extension}...`);
    const text = await extractTextFromBuffer(file_name, buffer);
    
    if (!text || text.trim().length < 10) {
      throw new Error('Texte insuffisant extrait du fichier');
    }
    
    // Analyser le texte
    console.log('🧠 Analyse du texte...');
    const parsedData = await analyzeText(text, file_name);
    
    // Réponse réussie
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      ok: true,
      data: parsedData,
      metadata: {
        text_length: text.length,
        extraction_time: new Date().toISOString(),
        file_format: extension
      }
    });
    
  } catch (error: any) {
    console.error('❌ Erreur API Parse:', error.message);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      ok: false,
      error: error.message || 'Erreur interne du serveur',
      timestamp: new Date().toISOString()
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Augmenter la limite pour les fichiers
    },
    responseLimit: false,
  },
};