// pages/api/parse.ts - VERSION CORRECTE ET FONCTIONNELLE
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { promisify } from 'util';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';

const readFile = promisify(fs.readFile);

export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialiser Supabase avec TES URLS
const SUPABASE_URL = 'https://cpdokjsyxmohubgvxift.supabase.co';
const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ==================== FONCTIONS UTILITAIRES ====================

function cleanTextForDB(text: string): string {
  if (!text) return '';
  return text
    .replace(/\x00/g, '')
    .replace(/\\u0000/g, '')
    .replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateUniqueId(filename: string): string {
  const hash = crypto.createHash('md5').update(filename + Date.now()).digest('hex').substring(0, 12);
  return `cv_${hash}`;
}

// ==================== EXTRACTION DE TEXTE ====================

async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  
  try {
    if (lower.endsWith('.pdf')) {
      // Dynamique import pour éviter les erreurs
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return data.text || '';
    } else if (lower.endsWith('.docx')) {
      // Dynamique import
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    } else if (lower.endsWith('.doc')) {
      return buffer.toString('utf8');
    } else {
      return buffer.toString('utf8');
    }
  } catch (error) {
    console.error(`Erreur extraction texte ${filename}:`, error);
    return buffer.toString('utf8');
  }
}

// ==================== EXTRACTION DES INFORMATIONS ====================

function extractNomPrenom(text: string, filename: string): { nom: string; prenom: string } {
  const lines = text.split('\n').slice(0, 10);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Pattern: NOM Prénom
    const nomMajPattern = /^([A-ZÉÈÊËÀÂÄÔÖÛÜÇ\s-]+)\s+([A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç\s-]+)$/;
    const matchMaj = trimmed.match(nomMajPattern);
    if (matchMaj) {
      return { nom: matchMaj[1].trim(), prenom: matchMaj[2].trim() };
    }
    
    // Pattern: Prénom NOM
    const pattern = /^([A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç]+(?:\s+[A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç]+)*)\s+([A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç]+)$/;
    const match = trimmed.match(pattern);
    if (match) {
      return { nom: match[2].trim(), prenom: match[1].trim() };
    }
  }
  
  // Fallback: nom du fichier
  const cleanFileName = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/CV[_\s-]*/i, '')
    .replace(/[0-9_-]+/g, ' ')
    .trim();
  
  const nameParts = cleanFileName.split(/\s+/).filter(p => p.length > 1);
  
  if (nameParts.length >= 2) {
    return {
      nom: nameParts[nameParts.length - 1],
      prenom: nameParts.slice(0, -1).join(' ')
    };
  }
  
  return { nom: '', prenom: 'Candidat' };
}

function extractEmail(text: string): string | null {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(emailPattern);
  return match ? match[0] : null;
}

function extractTelephone(text: string): string | null {
  const phonePatterns = [
    /(\+33|0033|0)[1-9](?:[\s.-]?\d{2}){4}/,
    /0[1-9](?:[\s.-]?\d{2}){4}/
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      let phone = match[0].replace(/[\s.\-+()]/g, '');
      
      if (phone.startsWith('0033')) {
        phone = '0' + phone.substring(4);
      } else if (phone.startsWith('+33')) {
        phone = '0' + phone.substring(3);
      }
      
      if (phone.length >= 10) {
        return phone.substring(0, 10);
      }
    }
  }
  
  return null;
}

function extractCompetences(text: string): string[] {
  const competences: string[] = [];
  const textLower = text.toLowerCase();
  
  // Chercher section COMPÉTENCES
  const skillsIndex = textLower.indexOf('compétences');
  const skillsIndex2 = textLower.indexOf('skills');
  const index = Math.max(skillsIndex, skillsIndex2);
  
  if (index !== -1) {
    const skillsText = text.substring(index, Math.min(index + 1500, text.length));
    const lines = skillsText.split('\n');
    
    for (let i = 1; i < Math.min(lines.length, 20); i++) {
      const line = lines[i].trim();
      
      // Arrêter si nouvelle section
      if (line.match(/^(expérience|formation|langues|projets|contact)/i)) {
        break;
      }
      
      // Extraire les compétences avec puces
      if (line && (line.startsWith('-') || line.startsWith('•'))) {
        const skill = line.replace(/^[-•*]\s*/, '').trim();
        if (skill && skill.length > 2) {
          competences.push(skill);
        }
      }
    }
  }
  
  // Si pas de section, chercher les listes partout
  if (competences.length === 0) {
    const bulletedItems = text.match(/[-•*]\s+([^\n]{2,80})/g) || [];
    for (const item of bulletedItems) {
      const skill = item.replace(/^[-•*]\s+/, '').trim();
      if (skill && skill.length > 2) {
        competences.push(skill);
      }
    }
  }
  
  // Limiter et nettoyer
  return [...new Set(competences)]
    .filter(skill => skill.length > 2 && skill.length < 100)
    .slice(0, 15);
}

function extractExperiences(text: string): any[] {
  const experiences: any[] = [];
  const textLower = text.toLowerCase();
  
  // Chercher section EXPÉRIENCE
  const expIndex = textLower.indexOf('expérience');
  const expIndex2 = textLower.indexOf('parcours professionnel');
  const index = Math.max(expIndex, expIndex2);
  
  if (index !== -1) {
    const expText = text.substring(index, Math.min(index + 3000, text.length));
    const lines = expText.split('\n');
    
    let currentExp: any = null;
    
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      const line = lines[i].trim();
      
      // Arrêter si nouvelle section
      if (line.match(/^(formation|compétences|langues|projets)/i)) {
        if (currentExp) {
          experiences.push(currentExp);
        }
        break;
      }
      
      // Détecter une nouvelle expérience (ligne avec date)
      if (line.match(/\d{4}/) && line.length > 10) {
        if (currentExp) {
          experiences.push(currentExp);
        }
        
        // Extraire dates
        const dateMatch = line.match(/(\d{4})(?:\s*[-–]\s*(\d{4}|présent))?/);
        const startYear = dateMatch ? dateMatch[1] : null;
        const endYear = dateMatch ? (dateMatch[2] || null) : null;
        const enCours = endYear === 'présent';
        
        // Calculer durée
        let duree_mois = 0;
        if (startYear && endYear && !enCours) {
          duree_mois = (parseInt(endYear) - parseInt(startYear) + 1) * 12;
        } else if (startYear) {
          duree_mois = 12;
        }
        
        // Extraire poste et entreprise
        let poste = '';
        let entreprise = '';
        let cleanLine = line.replace(/(\d{4}\s*[-–]\s*\d{4})|(\d{4})/g, '').trim();
        
        const chezMatch = cleanLine.match(/(.+?)\s+chez\s+(.+)/i);
        const aMatch = cleanLine.match(/(.+?)\s+à\s+(.+)/i);
        
        if (chezMatch) {
          poste = chezMatch[1].trim();
          entreprise = chezMatch[2].trim();
        } else if (aMatch) {
          poste = aMatch[1].trim();
          entreprise = aMatch[2].trim();
        } else {
          poste = cleanLine;
          entreprise = 'Entreprise non spécifiée';
        }
        
        currentExp = {
          entreprise,
          poste,
          duree: `${startYear || ''}${endYear ? `-${endYear}` : ''}`,
          dates: {
            start: startYear ? `${startYear}-01-01` : null,
            end: endYear && !enCours ? `${endYear}-12-31` : null
          },
          duree_mois,
          responsabilites: []
        };
      }
      // Lignes de description
      else if (line && (line.startsWith('-') || line.startsWith('•'))) {
        if (currentExp && currentExp.responsabilites) {
          currentExp.responsabilites.push(line.replace(/^[-•*]\s*/, ''));
        }
      }
    }
    
    if (currentExp) {
      experiences.push(currentExp);
    }
  }
  
  return experiences.slice(0, 10);
}

function extractFormations(text: string): any[] {
  const formations: any[] = [];
  const textLower = text.toLowerCase();
  
  // Chercher section FORMATION
  const formationIndex = textLower.indexOf('formation');
  const educationIndex = textLower.indexOf('éducation');
  const index = Math.max(formationIndex, educationIndex);
  
  if (index !== -1) {
    const formationText = text.substring(index, Math.min(index + 1500, text.length));
    const lines = formationText.split('\n');
    
    for (let i = 1; i < Math.min(lines.length, 15); i++) {
      const line = lines[i].trim();
      
      // Arrêter si nouvelle section
      if (line.match(/^(expérience|compétences|langues|projets)/i)) {
        break;
      }
      
      // Chercher des diplômes
      if (line && (line.match(/\d{4}/) || line.match(/(bac|bts|licence|master|doctorat)/i))) {
        const yearMatch = line.match(/(\d{4})/);
        const annee = yearMatch ? yearMatch[1] : null;
        
        let diplome = '';
        const diplomeMatch = line.match(/(bac|bts|dut|licence|master|doctorat)/i);
        if (diplomeMatch) {
          diplome = diplomeMatch[1].charAt(0).toUpperCase() + diplomeMatch[1].slice(1).toLowerCase();
        }
        
        let ecole = line
          .replace(/(\d{4})/g, '')
          .replace(/(bac|bts|dut|licence|master|doctorat)/gi, '')
          .replace(/[^\w\sÀ-ÿ-]/g, ' ')
          .trim();
        
        if (diplome || ecole) {
          formations.push({
            diplome: diplome || 'Diplôme',
            ecole: ecole || 'Établissement non spécifié',
            annee
          });
        }
      }
    }
  }
  
  return formations.slice(0, 5);
}

// ==================== FONCTION PRINCIPALE ====================

async function parseCV(buffer: Buffer, filename: string): Promise<any> {
  try {
    // 1. Extraire le texte
    const rawText = await extractTextFromBuffer(buffer, filename);
    const cleanedText = cleanTextForDB(rawText);
    
    console.log(`🔍 Analyse CV: ${filename} (${cleanedText.length} caractères)`);
    
    // 2. Extraire toutes les informations
    const { nom, prenom } = extractNomPrenom(cleanedText, filename);
    const email = extractEmail(cleanedText);
    const telephone = extractTelephone(cleanedText);
    const competences = extractCompetences(cleanedText);
    const experiences = extractExperiences(cleanedText);
    const formations = extractFormations(cleanedText);
    
    // 3. Calculer années d'expérience
    const annees_experience = experiences.reduce((sum, exp) => {
      return sum + (exp.duree_mois || 0);
    }, 0) / 12;
    
    // 4. Déterminer métier (simplifié)
    let metier = 'Non spécifié';
    const textLower = cleanedText.toLowerCase();
    if (textLower.includes('développeur') || textLower.includes('developer')) {
      metier = 'Développeur';
    } else if (textLower.includes('commercial') || textLower.includes('vente')) {
      metier = 'Commercial';
    } else if (textLower.includes('marketing')) {
      metier = 'Marketing';
    } else if (textLower.includes('gestionnaire') || textLower.includes('administratif')) {
      metier = 'Gestionnaire';
    } else if (textLower.includes('chef de projet')) {
      metier = 'Chef de projet';
    }
    
    // 5. Déterminer niveau
    let niveau = 'Junior';
    if (annees_experience >= 10) niveau = 'Expert';
    else if (annees_experience >= 5) niveau = 'Senior';
    else if (annees_experience >= 2) niveau = 'Confirmé';
    
    return {
      nom: nom || '',
      prenom: prenom || '',
      email,
      telephone,
      competences,
      experiences,
      formations,
      metiers: metier,
      niveau,
      annees_experience: Math.round(annees_experience * 10) / 10,
      postes: experiences.map((exp: any) => exp.poste).filter(Boolean),
      profil: `${niveau} ${metier}`
    };
    
  } catch (error) {
    console.error(`❌ Erreur parsing ${filename}:`, error);
    throw error;
  }
}

// ==================== HANDLER API ====================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'CV Parser API',
      endpoint: 'https://apitruthtalent.vercel.app/api/parse',
      version: '1.0.0',
      usage: 'POST with file_url or multipart/form-data'
    });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const contentType = req.headers['content-type'] || '';
    let file_url = '';
    let fileBuffer: Buffer;
    let filename = 'cv';
    
    console.log('📥 Requête reçue, Content-Type:', contentType);
    
    // Traiter JSON avec file_url
    if (contentType.includes('application/json')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      const data = JSON.parse(body);
      file_url = data.file_url;
      
      if (!file_url) {
        return res.status(400).json({ error: 'URL manquante' });
      }
      
      console.log(`📄 Téléchargement depuis: ${file_url}`);
      
      const response = await fetch(file_url);
      if (!response.ok) {
        throw new Error(`Échec téléchargement: ${response.status} ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      filename = file_url.split('/').pop() || 'cv';
      
    } 
    // Traiter form-data avec fichier
    else if (contentType.includes('multipart/form-data')) {
      const form = new IncomingForm();
      const [files] = await new Promise<any>((resolve, reject) => {
        form.parse(req, (err: any, fields: any, files: any) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });
      
      const file = files.file?.[0] || files.file;
      if (!file) {
        return res.status(400).json({ error: 'Fichier manquant' });
      }
      
      filename = file.originalFilename || file.newFilename;
      fileBuffer = await readFile(file.filepath);
      
      // Nettoyer le fichier temporaire
      try {
        fs.unlinkSync(file.filepath);
      } catch (e) {
        // Ignorer les erreurs de suppression
      }
      
    } else {
      return res.status(400).json({ 
        error: 'Content-Type non supporté',
        supported: ['application/json', 'multipart/form-data']
      });
    }
    
    // Parser le CV
    const extractedData = await parseCV(fileBuffer, filename);
    
    // Générer ID unique
    const uniqueId = generateUniqueId(filename);
    
    // Préparer les données pour Supabase
    const candidatData: any = {
      nom: extractedData.nom,
      prenom: extractedData.prenom,
      email: extractedData.email,
      telephone: extractedData.telephone,
      competences: extractedData.competences,
      experiences: extractedData.experiences,
      formations: extractedData.formations,
      metiers: extractedData.metiers,
      niveau: extractedData.niveau,
      annees_experience: extractedData.annees_experience,
      postes: extractedData.postes,
      profil: extractedData.profil,
      
      fichier: uniqueId,
      cv_url: file_url,
      cv_filename: filename,
      raw_text: fileBuffer.toString('utf8', 0, 5000),
      
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'analysé',
      date_analyse: new Date().toISOString()
    };
    
    console.log('💾 Sauvegarde dans Supabase...');
    
    // Sauvegarder dans Supabase
    const { data: savedData, error } = await supabase
      .from('candidats')
      .upsert(candidatData, { onConflict: 'fichier' })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        extracted_data: extractedData
      });
    }
    
    console.log(`✅ Candidat ${savedData.id} sauvegardé`);
    
    return res.status(200).json({
      success: true,
      candidat_id: savedData.id,
      candidat: extractedData,
      message: 'CV analysé avec succès'
    });
    
  } catch (error: any) {
    console.error('❌ Erreur API:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'PARSE_ERROR'
    });
  }
}