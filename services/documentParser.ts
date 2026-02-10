// services/documentParser.ts
import { NextResponse } from 'next/server';

// Interfaces de base
export interface CandidatData {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  competences: string[];
  metiers: string[];
  experiences: any[];
  formations: any[];
  langues: any[];
  raw_text?: string;
  adresse?: string;
  profil?: string;
  metadata?: {
    filename: string;
    filetype: string;
    extraction_date: string;
  };
}

export interface ParseCVResult {
  candidat: CandidatData;
  confidence_score: number;
}

// Fonction principale
export const parseCV = async (
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<ParseCVResult> => {
  console.log(`🔍 Début extraction CV: ${filename}`);
  
  try {
    // 1. Extraire le texte brut
    const rawText = await extractTextFromBuffer(buffer, filename, fileType);
    
    if (!rawText || rawText.length < 50) {
      throw new Error('Texte trop court ou vide');
    }
    
    console.log(`✅ Texte extrait: ${rawText.length} caractères`);
    
    // 2. Analyser le texte
    const candidatData = analyzeCVTextAdvanced(rawText);
    
    // 3. Calculer un score de confiance
    const confidence_score = calculateConfidenceScore(candidatData);
    
    console.log('📊 Résultats extraction:', {
      nom: candidatData.nom,
      prenom: candidatData.prenom,
      email: candidatData.email,
      telephone: candidatData.telephone,
      poste: candidatData.poste,
      competences: candidatData.competences?.length
    });
    
    return {
      candidat: candidatData,
      confidence_score
    };
    
  } catch (error: any) {
    console.error('❌ Erreur parseCV:', error.message);
    
    // Retourner une structure vide en cas d'erreur
    return {
      candidat: {
        nom: '',
        prenom: '',
        email: '',
        competences: [],
        metiers: [],
        experiences: [],
        formations: [],
        langues: [],
        metadata: {
          filename,
          filetype: fileType,
          extraction_date: new Date().toISOString()
        }
      },
      confidence_score: 0
    };
  }
};

// ==================== FONCTIONS D'EXTRACTION DE TEXTE ====================

async function extractTextFromBuffer(
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<string> {
  console.log(`📄 Extraction texte: ${filename} (${fileType})`);
  
  // Pour PDF
  if (fileType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    return await extractTextFromPDF(buffer);
  }
  
  // Pour les autres types (fallback)
  try {
    return buffer.toString('utf-8');
  } catch {
    throw new Error(`Format non supporté: ${fileType}`);
  }
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Utiliser pdf-parse si disponible
    const pdfParse = require('pdf-parse');
    const pdfData = await pdfParse(buffer);
    return pdfData.text || '';
  } catch (error: any) {
    console.error('⚠️ Erreur pdf-parse:', error.message);
    
    // Fallback basique pour extraire du texte
    const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 50000));
    
    // Chercher du texte dans le buffer
    const textMatch = text.match(/[A-Za-zÀ-ÿ0-9\s\.\,\-\'\"\(\)\[\]\{\}\/\\:\;]{100,}/s);
    if (textMatch) {
      return textMatch[0];
    }
    
    throw new Error('Impossible d\'extraire le texte du PDF');
  }
}

// ==================== FONCTIONS D'ANALYSE DE TEXTE ====================

function analyzeCVTextAdvanced(text: string): CandidatData {
  console.log('🧠 Analyse du texte CV...');
  
  // 1. Extraire les informations de base
  const email = extractEmail(text);
  const telephone = extractPhone(text);
  const { nom, prenom } = extractNameFromText(text);
  
  // 2. Extraire les compétences
  const competences = extractSkills(text);
  
  // 3. Extraire poste et entreprise
  const poste = extractCurrentPosition(text);
  const entreprise = extractCurrentCompany(text);
  
  // 4. Extraire adresse
  const adresse = extractAddress(text);
  
  // 5. Extraire métiers
  const metiers = extractMetiers(text);
  
  // 6. Construire l'objet complet
  return {
    nom,
    prenom,
    email,
    telephone,
    poste,
    entreprise,
    adresse,
    competences,
    metiers,
    experiences: [], // À implémenter si nécessaire
    formations: [], // À implémenter si nécessaire
    langues: [], // À implémenter si nécessaire
    raw_text: text.substring(0, 1000), // Limiter la taille
    metadata: {
      filename: 'cv.pdf',
      filetype: 'application/pdf',
      extraction_date: new Date().toISOString()
    }
  };
}

// ==================== FONCTIONS D'EXTRACTION SPÉCIFIQUES ====================

function extractEmail(text: string): string {
  const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  return emailMatch ? emailMatch[0] : '';
}

function extractPhone(text: string): string {
  const phoneMatch = text.match(/(?:\+33|0)[1-9](?:[\s\.-]?\d{2}){4}/);
  return phoneMatch ? phoneMatch[0] : '';
}

function extractNameFromText(text: string): { nom: string, prenom: string } {
  // Prendre les 15 premières lignes
  const lines = text.split('\n').slice(0, 15);
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Pattern 1: "Jean-François BOISGONTIER" (prénom + NOM en majuscules)
    const pattern1 = trimmedLine.match(/^([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+(?:\s+[A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+)*)\s+([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ\-]{2,})$/);
    if (pattern1) {
      console.log(`✅ Nom détecté (Pattern 1): ${pattern1[1]} ${pattern1[2]}`);
      return { prenom: pattern1[1], nom: pattern1[2] };
    }
    
    // Pattern 2: "BOISGONTIER Jean-François" (NOM + prénom)
    const pattern2 = trimmedLine.match(/^([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ\-]{2,})\s+([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+(?:\s+[A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+)*)$/);
    if (pattern2) {
      console.log(`✅ Nom détecté (Pattern 2): ${pattern2[1]} ${pattern2[2]}`);
      return { nom: pattern2[1], prenom: pattern2[2] };
    }
    
    // Pattern 3: Ligne avec au moins 2 mots commençant par une majuscule
    if (trimmedLine.length > 5 && trimmedLine.length < 50) {
      const words = trimmedLine.split(/\s+/);
      if (words.length >= 2) {
        const allValid = words.every(word => /^[A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ]/.test(word));
        if (allValid) {
          // Dernier mot = nom de famille (convention française)
          return { 
            prenom: words.slice(0, -1).join(' '), 
            nom: words[words.length - 1] 
          };
        }
      }
    }
  }
  
  console.log('⚠️ Nom non détecté');
  return { nom: '', prenom: '' };
}

function extractSkills(text: string): string[] {
  const skills = new Set<string>();
  const lowerText = text.toLowerCase();
  
  // 1. Liste de compétences techniques courantes
  const techSkills = [
    'javascript', 'typescript', 'react', 'node.js', 'node', 'python', 'java',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
    'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
    'git', 'jenkins', 'gitlab', 'github', 'ci/cd', 'devops',
    'linux', 'windows', 'unix', 'bash', 'shell',
    'html', 'css', 'sass', 'vue.js', 'angular', 'next.js', 'react native',
    'spring', '.net', 'django', 'flask', 'express',
    'jira', 'confluence', 'agile', 'scrum', 'kanban'
  ];
  
  for (const skill of techSkills) {
    if (lowerText.includes(skill)) {
      skills.add(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }
  
  // 2. Chercher la section "Compétences"
  const skillsSection = text.match(/Compétences[:\s\n]+([^•\n]+(?:\n[^•\n]+)*)/i);
  if (skillsSection && skillsSection[1]) {
    const skillsText = skillsSection[1];
    const lines = skillsText.split(/[\n•\-]/);
    
    for (const line of lines) {
      const cleanLine = line.replace(/[:：]/g, ',').trim();
      if (cleanLine) {
        const items = cleanLine.split(/[,;]/);
        for (const item of items) {
          const skill = item.trim();
          if (skill && skill.length > 1 && skill.length < 50 && !skill.includes('@')) {
            skills.add(skill);
          }
        }
      }
    }
  }
  
  // 3. Chercher des compétences dans tout le texte (mots en majuscules courts)
  const uppercaseWords = text.match(/\b[A-Z]{2,}[A-Z0-9]*\b/g);
  if (uppercaseWords) {
    for (const word of uppercaseWords) {
      if (word.length > 2 && word.length < 10) {
        // Vérifier si c'est une technologie connue
        const knownTechs = ['API', 'REST', 'JSON', 'XML', 'HTTP', 'HTTPS', 'SSH', 'SSL', 'TLS'];
        if (knownTechs.includes(word)) {
          skills.add(word);
        }
      }
    }
  }
  
  // Convertir en tableau et limiter
  const skillsArray = Array.from(skills);
  return skillsArray.slice(0, 20);
}

function extractCurrentPosition(text: string): string {
  const lines = text.split('\n').slice(0, 20);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Chercher des titres professionnels
    const positionPatterns = [
      /Chef\s+de\s+projet/i,
      /Développeur/i,
      /Ingénieur/i,
      /Architecte/i,
      /Consultant/i,
      /Manager/i,
      /Analyste/i,
      /Designer/i,
      /Product\s+Owner/i,
      /Scrum\s+Master/i,
      /DevOps/i,
      /SysOps/i,
      /Administrateur/i,
      /Technicien/i
    ];
    
    for (const pattern of positionPatterns) {
      if (pattern.test(trimmed) && !trimmed.includes('@') && trimmed.length > 5 && trimmed.length < 100) {
        console.log(`✅ Poste détecté: ${trimmed}`);
        return trimmed;
      }
    }
  }
  
  // Chercher dans tout le texte
  for (const pattern of [/Chef de projet.*?\n/i, /Ingénieur.*?\n/i, /Développeur.*?\n/i]) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  
  return '';
}

function extractCurrentCompany(text: string): string {
  // Chercher après le poste ou dans les expériences
  const expMatch = text.match(/(\d{4}).*?[-–]\s*(?:.*?)[-–]\s*([^\n\-\(]+)/);
  if (expMatch && expMatch[2]) {
    const company = expMatch[2].trim();
    if (company && company.length > 2) {
      // Nettoyer les parenthèses
      const cleaned = company.replace(/\(.*?\)/g, '').trim();
      if (cleaned) {
        console.log(`✅ Entreprise détectée: ${cleaned}`);
        return cleaned;
      }
    }
  }
  
  return '';
}

function extractAddress(text: string): string {
  // Chercher des indices d'adresse
  const patterns = [
    /(?:habite|vit|adresse|domicilié|réside)[:\s\n]+([^\n]{10,50})/i,
    /\b\d{5}\b.*?([A-Za-zÀ-ÿ\s]{10,30})/,
    /([A-Za-zÀ-ÿ\s]{10,30})\s+\d{5}\s+[A-Za-zÀ-ÿ]+/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return '';
}

function extractMetiers(text: string): string[] {
  const metiers = new Set<string>();
  const lowerText = text.toLowerCase();
  
  // Métiers courants dans l'IT
  const commonJobs = [
    'développeur', 'ingénieur', 'architecte', 'consultant', 'manager',
    'analyste', 'administrateur', 'technicien', 'chef de projet',
    'product owner', 'scrum master', 'devops', 'data scientist',
    'data analyst', 'ux designer', 'ui designer', 'testeur'
  ];
  
  for (const metier of commonJobs) {
    if (lowerText.includes(metier)) {
      // Capitaliser la première lettre
      metiers.add(metier.charAt(0).toUpperCase() + metier.slice(1));
    }
  }
  
  return Array.from(metiers);
}

function calculateConfidenceScore(candidat: CandidatData): number {
  let score = 0;
  
  // Nom et prénom: +30 points
  if (candidat.nom && candidat.prenom) score += 30;
  else if (candidat.nom || candidat.prenom) score += 15;
  
  // Email: +20 points
  if (candidat.email) score += 20;
  
  // Téléphone: +10 points
  if (candidat.telephone) score += 10;
  
  // Poste: +15 points
  if (candidat.poste) score += 15;
  
  // Compétences: +25 points (max 25)
  const skillsScore = Math.min(candidat.competences.length * 2, 25);
  score += skillsScore;
  
  // Limiter à 100
  return Math.min(score, 100) / 100;
}

// ==================== EXPORT DES FONCTIONS UTILITAIRES ====================

export {
  extractTextFromBuffer,
  extractTextFromPDF,
  extractEmail,
  extractPhone,
  extractNameFromText,
  extractSkills,
  extractCurrentPosition,
  extractCurrentCompany,
  extractAddress,
  extractMetiers
};