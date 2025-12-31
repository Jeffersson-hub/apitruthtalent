// pages/api/parse.ts - VERSION COMPLÈTE CORRIGÉE
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

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

// ==================== FONCTIONS D'EXTRACTION ====================

async function extractTextFromBuffer(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  
  try {
    if (lower.endsWith('.pdf')) {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text || '';
    } else if (lower.endsWith('.docx')) {
      const mammoth = require('mammoth');
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

function extractNomPrenomProfessionnel(text: string, filename: string): { nom: string; prenom: string } {
  const lines = text.split('\n').slice(0, 10);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    const nomMajPattern = /^([A-ZÉÈÊËÀÂÄÔÖÛÜÇ\s-]+)\s+([A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç\s-]+)$/;
    const matchMaj = trimmed.match(nomMajPattern);
    if (matchMaj) {
      return { nom: matchMaj[1].trim(), prenom: matchMaj[2].trim() };
    }
    
    const pattern = /^([A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç]+(?:\s+[A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç]+)*)\s+([A-ZÉÈÊËÀÂÄÔÖÛÜÇ][a-zéèêëàâäôöûüç]+)$/;
    const match = trimmed.match(pattern);
    if (match) {
      return { nom: match[2].trim(), prenom: match[1].trim() };
    }
  }
  
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

function extractContactProfessionnel(text: string): { email: string | null; telephone: string | null } {
  const emailPatterns = [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    /\b[\w.]+@(?:gmail|hotmail|yahoo|outlook|orange|free|sfr|bbox|laposte)\.(?:com|fr|net|org)\b/gi
  ];
  
  let email = null;
  for (const pattern of emailPatterns) {
    const matches = text.match(pattern);
    if (matches && matches[0]) {
      email = matches[0].toLowerCase();
      break;
    }
  }
  
  const phonePatterns = [
    /(\+33|0033|0)[1-9](?:[\s.-]?\d{2}){4}/g,
    /0[1-9](?:[\s.-]?\d{2}){4}/g,
    /(\+33\s?\(0\)\s?[1-9](?:[\s.-]?\d{2}){4})/g,
    /(?:téléphone|tel|phone)[:\s]*([0-9\s.\-+()]{10,20})/gi
  ];
  
  let telephone = null;
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches && matches[0]) {
      let phone = matches[0].replace(/[\s.\-+()]/g, '');
      
      if (phone.startsWith('0033')) {
        phone = '0' + phone.substring(4);
      } else if (phone.startsWith('+33')) {
        phone = '0' + phone.substring(3);
      }
      
      if (phone.length >= 10) {
        telephone = phone.substring(0, 10);
        break;
      }
    }
  }
  
  return { email, telephone };
}

function extractAdresseProfessionnelle(text: string): string | null {
  const addressPatterns = [
    /(\d{1,5}\s+[A-Za-zéèêëàâäôöûüç\s]+,\s*\d{5}\s+[A-Za-zéèêëàâäôöûüç\s]+)/gi,
    /(\d{5}\s+[A-Za-zéèêëàâäôöûüç\s]+)/gi,
    /([A-Za-zéèêëàâäôöûüç\s]+\s+\d{5}\s+[A-Za-zéèêëàâäôöûüç\s]+)/gi,
    /(?:adresse|address)[:\s]*([^\n]{10,100})/gi
  ];
  
  for (const pattern of addressPatterns) {
    const matches = text.match(pattern);
    if (matches && matches[0]) {
      return matches[0].trim();
    }
  }
  
  return null;
}

// ==================== EXTRACTION COMPÉTENCES (CORRIGÉE) ====================

function extractCompetencesProfessionnelles(text: string): string[] {
  console.log('🔍 Extraction structurée des compétences...');
  
  const competences: string[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Étape 1: Trouver la section COMPÉTENCES
  let skillsStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    
    // Recherche exacte de la section
    if (lineUpper === 'COMPÉTENCES' || 
        lineUpper === 'COMPETENCES' || 
        lineUpper === 'SKILLS' ||
        lineUpper.startsWith('COMPÉTENCES ') ||
        lineUpper.startsWith('COMPETENCES ') ||
        lineUpper.startsWith('SKILLS ')) {
      
      skillsStartIndex = i;
      console.log(`📌 Section compétences trouvée ligne ${i}: "${lines[i]}"`);
      break;
    }
  }
  
  // Étape 2: Extraire le contenu de la section
  if (skillsStartIndex !== -1) {
    const sectionLines: string[] = [];
    
    // Prendre les lignes jusqu'à la prochaine section
    for (let i = skillsStartIndex + 1; i < Math.min(skillsStartIndex + 20, lines.length); i++) {
      const line = lines[i];
      
      // Arrêter à la prochaine section majeure
      const nextLineUpper = line.toUpperCase();
      if (nextLineUpper.includes('EXPÉRIENCE') || 
          nextLineUpper.includes('FORMATION') || 
          nextLineUpper.includes('LANGUES') ||
          nextLineUpper.includes('PROJETS') ||
          nextLineUpper.includes('CENTRE') ||
          line === '' && i > skillsStartIndex + 3) {
        break;
      }
      
      if (line && line.trim()) {
        sectionLines.push(line);
      }
    }
    
    console.log(`📝 ${sectionLines.length} lignes dans la section compétences`);
    
    // Étape 3: Analyser chaque ligne
    for (const line of sectionLines) {
      // Format 1: Ligne avec tiret/puce (• JavaScript, React, Node.js)
      if (line.match(/^[-•*]\s/)) {
        const content = line.substring(line.indexOf(' ') + 1).trim();
        processCompetenceLine(content, competences);
      }
      // Format 2: Ligne numérotée (1. JavaScript)
      else if (line.match(/^\d+[\.\)]\s/)) {
        const content = line.replace(/^\d+[\.\)]\s+/, '').trim();
        processCompetenceLine(content, competences);
      }
      // Format 3: Ligne simple (JavaScript, React, Node.js)
      else {
        processCompetenceLine(line, competences);
      }
    }
  }
  
  // Étape 4: Si section non trouvée, chercher par pattern
  if (competences.length === 0) {
    console.log('🔍 Recherche alternative des compétences...');
    
    // Pattern: "Compétences : JavaScript, React"
    const pattern = /compétences?\s*[:•-]\s*([^\n]{10,200})/gi;
    let match;
    
    while ((match = pattern.exec(text)) !== null && competences.length < 10) {
      const skillsText = match[1].trim();
      console.log(`📌 Pattern trouvé: "${skillsText.substring(0, 50)}..."`);
      processCompetenceLine(skillsText, competences);
    }
  }
  
  // Étape 5: Nettoyage final
  const cleaned = cleanCompetencesList(competences);
  
  console.log(`✅ ${cleaned.length} compétences extraites:`, cleaned.slice(0, 10));
  return cleaned;
}

function processCompetenceLine(line: string, competences: string[]): void {
  // Nettoyer la ligne
  let cleanLine = line
    .replace(/\([^)]*\)/g, '') // Enlever les parenthèses (niveaux)
    .replace(/\s+/g, ' ') // Normaliser les espaces
    .trim();
  
  // Séparateurs courants dans les CV
  const separators = /[,;\/\|]\s*/;
  
  if (cleanLine.match(separators)) {
    // Sépare par virgules, points-virgules, etc.
    const parts = cleanLine.split(separators);
    
    for (let part of parts) {
      part = part.trim();
      
      if (isValidCompetence(part) && part.length > 2 && part.length < 50) {
        // Formater la compétence
        const formatted = formatCompetence(part);
        if (formatted && !competences.includes(formatted)) {
          competences.push(formatted);
        }
      }
    }
  } else if (isValidCompetence(cleanLine)) {
    // Une seule compétence
    const formatted = formatCompetence(cleanLine);
    if (formatted && !competences.includes(formatted)) {
      competences.push(formatted);
    }
  }
}

function isValidCompetence(text: string): boolean {
  if (!text || text.length < 2 || text.length > 50) return false;
  
  const lower = text.toLowerCase();
  
  // Exclure les non-compétences
  const excluded = [
    'ans', 'années', 'année', 'mois', 'expérience', 'expériences',
    'stage', 'stages', 'alternance', 'mission', 'débutant',
    'intermédiaire', 'expert', 'junior', 'senior', 'confirmé',
    'et', 'ou', 'de', 'du', 'des', 'le', 'la', 'les'
  ];
  
  if (excluded.includes(lower)) return false;
  
  // Exclure les dates
  if (text.match(/\d{4}/)) return false;
  
  // Exclure les phrases (trop de mots)
  const words = text.split(/\s+/);
  if (words.length > 5) return false;
  
  return true;
}

function formatCompetence(text: string): string {
  // Nettoyer
  let cleaned = text.trim();
  
  // Capitaliser proprement
  if (cleaned === cleaned.toUpperCase()) {
    return cleaned; // HTML, CSS, SQL
  } else if (cleaned.match(/^[a-z]+$/)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  } else {
    return cleaned.split(' ').map(word => {
      if (word.toUpperCase() === word) {
        return word;
      } else {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
    }).join(' ');
  }
}

function cleanCompetencesList(competences: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  
  for (const comp of competences) {
    if (!comp || comp.trim() === '') continue;
    
    const trimmed = comp.trim();
    const lower = trimmed.toLowerCase();
    
    if (!seen.has(lower) && trimmed.length > 2 && trimmed.length < 50) {
      cleaned.push(trimmed);
      seen.add(lower);
    }
  }
  
  return cleaned.slice(0, 15);
}

// ==================== EXTRACTION EXPÉRIENCES ====================

function extractExperiencesProfessionnelles(text: string): any[] {
  console.log('🔍 Extraction structurée des expériences...');
  
  const experiences: any[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  // Trouver la section EXPÉRIENCES
  let expStartIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase();
    
    if (lineUpper.includes('EXPÉRIENCE PROFESSIONNELLE') || 
        lineUpper.includes('EXPERIENCE PROFESSIONNELLE') ||
        lineUpper.includes('EXPÉRIENCES') ||
        lineUpper.includes('EXPERIENCES') ||
        lineUpper === 'EXPÉRIENCE' ||
        lineUpper === 'EXPERIENCE') {
      
      expStartIndex = i;
      console.log(`📌 Section expériences trouvée ligne ${i}`);
      break;
    }
  }
  
  // Extraire les expériences
  if (expStartIndex !== -1) {
    let currentExp: any = null;
    
    for (let i = expStartIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      
      // Arrêter à la prochaine section
      const lineUpper = line.toUpperCase();
      if (lineUpper.includes('FORMATION') || 
          lineUpper.includes('EDUCATION') ||
          lineUpper.includes('COMPÉTENCES') ||
          lineUpper.includes('LANGUES')) {
        break;
      }
      
      // Détecter une nouvelle expérience (ligne avec dates)
      const dateMatch = line.match(/(\d{4})\s*[-–à]\s*(\d{4}|présent|aujourd'hui|actuel)/i);
      const companyMatch = line.match(/chez\s+([^,\n]+)/i) || line.match(/à\s+([^,\n]+)/i);
      
      if (dateMatch || (line.length > 10 && line.length < 100 && !line.startsWith('-'))) {
        // Sauvegarder l'expérience précédente
        if (currentExp) {
          experiences.push(currentExp);
        }
        
        // Nouvelle expérience
        currentExp = {
          poste: extractPosteFromLine(line),
          entreprise: companyMatch ? companyMatch[1].trim() : extractCompanyFromLine(line),
          description: '',
          date_debut: dateMatch ? dateMatch[1] : null,
          date_fin: dateMatch ? (dateMatch[2].match(/\d{4}/) ? dateMatch[2] : null) : null,
          en_cours: dateMatch ? (dateMatch[2].toLowerCase().includes('présent') || 
                                dateMatch[2].toLowerCase().includes('aujourd') ||
                                dateMatch[2].toLowerCase().includes('actuel')) : false
        };
      }
      // Description (lignes avec tirets)
      else if (currentExp && (line.startsWith('-') || line.startsWith('•'))) {
        currentExp.description += line.substring(1).trim() + ' ';
      }
      // Autre information
      else if (currentExp && line.length > 5 && line.length < 200) {
        if (!currentExp.poste && line.length < 50) {
          currentExp.poste = line;
        } else if (!currentExp.entreprise && line.length < 50) {
          currentExp.entreprise = line;
        }
      }
    }
    
    // Ajouter la dernière expérience
    if (currentExp) {
      experiences.push(currentExp);
    }
  }
  
  console.log(`✅ ${experiences.length} expériences extraites`);
  return experiences.slice(0, 10);
}

function extractPosteFromLine(line: string): string {
  // Chercher avant "chez", "à", ","
  const parts = line.split(/chez|à|,/i);
  if (parts[0]) {
    // Enlever les dates
    const withoutDates = parts[0].replace(/\d{4}.*$/, '').trim();
    if (withoutDates.length > 3) {
      return withoutDates;
    }
  }
  
  // Prendre les premiers mots significatifs
  const words = line.split(/\s+/).filter(w => w.length > 3);
  return words.slice(0, 3).join(' ') || 'Poste';
}

function extractCompanyFromLine(line: string): string {
  // Chercher après "chez", "à"
  const chezMatch = line.match(/chez\s+([^,\n]+)/i);
  if (chezMatch) return chezMatch[1].trim();
  
  const aMatch = line.match(/à\s+([^,\n]+)/i);
  if (aMatch) return aMatch[1].trim();
  
  // Chercher des noms d'entreprise en majuscules
  const companyMatch = line.match(/\b([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]{3,50})\b/);
  if (companyMatch) return companyMatch[1].trim();
  
  return 'Entreprise';
}

// ==================== EXTRACTION METIERS ET POSTES ====================

function extractMetiersPostesProfessionnels(text: string, experiences: any[]): { metiers: string; postes: string } {
  const foundMetiers = new Set<string>();
  const foundPostes = new Set<string>();
  
  // Extraire des expériences
  experiences.forEach(exp => {
    if (exp.poste && exp.poste !== 'Poste') {
      foundPostes.add(exp.poste);
      
      // Détecter le métier depuis le poste
      if (exp.poste.toLowerCase().includes('développeur')) foundMetiers.add('Développeur');
      if (exp.poste.toLowerCase().includes('ingénieur')) foundMetiers.add('Ingénieur');
      if (exp.poste.toLowerCase().includes('consultant')) foundMetiers.add('Consultant');
      if (exp.poste.toLowerCase().includes('analyste')) foundMetiers.add('Analyste');
      if (exp.poste.toLowerCase().includes('manager')) foundMetiers.add('Manager');
      if (exp.poste.toLowerCase().includes('commercial')) foundMetiers.add('Commercial');
    }
  });
  
  // Chercher dans le texte
  const metierKeywords = ['Développeur', 'Ingénieur', 'Consultant', 'Analyste', 'Manager', 'Commercial'];
  const textLower = text.toLowerCase();
  
  metierKeywords.forEach(metier => {
    if (textLower.includes(metier.toLowerCase())) {
      foundMetiers.add(metier);
    }
  });
  
  return {
    metiers: Array.from(foundMetiers).slice(0, 3).join(', ') || 'À déterminer',
    postes: Array.from(foundPostes).slice(0, 3).join(', ') || 'À déterminer'
  };
}

function extractEntrepriseActuelle(experiences: any[]): string {
  if (experiences.length > 0) {
    return experiences[0].entreprise || 'À déterminer';
  }
  return 'À déterminer';
}

function extractProfilProfessionnel(text: string): string {
  const lines = text.split('\n');
  let startIndex = 0;
  
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (lines[i].trim().length > 5) {
      startIndex = i + 1;
      break;
    }
  }
  
  const profileLines = [];
  for (let i = startIndex; i < Math.min(startIndex + 5, lines.length); i++) {
    const line = lines[i].trim();
    if (line && !line.match(/^(téléphone|email|adresse|expérience|formation|compétence)/i)) {
      profileLines.push(line);
    }
  }
  
  const profile = profileLines.join(' ').substring(0, 200);
  return profile || `CV professionnel`;
}

function extractFormationsProfessionnelles(text: string): any[] {
  const formations: any[] = [];
  const lines = text.split('\n');
  
  let inFormationSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.match(/formations?|diplômes?|études?|éducation/i)) {
      inFormationSection = true;
      continue;
    }
    
    if (inFormationSection && line.match(/expériences?|compétences?|langues?|projets?/i)) {
      inFormationSection = false;
    }
    
    if (inFormationSection && line) {
      const datePattern = /(\d{4})\s*[-–]\s*(\d{4})?/;
      const dateMatch = line.match(datePattern);
      
      if (dateMatch || line.match(/(bac|bts|licence|master|doctorat|ingénieur)/i)) {
        formations.push({
          diplome: extractDiplomeFromLine(line),
          etablissement: extractEtablissementFromLine(line),
          annee: dateMatch ? dateMatch[1] : null,
          raw: line
        });
      }
    }
  }
  
  if (formations.length === 0) {
    const diplomaPattern = /(bac\s*[a-z]*|bts|licence|master|doctorat|ingénieur)[^,\n]*(\d{4})?/gi;
    let match;
    while ((match = diplomaPattern.exec(text)) !== null && formations.length < 5) {
      formations.push({
        diplome: match[1].trim(),
        etablissement: '',
        annee: match[2] || null,
        raw: match[0]
      });
    }
  }
  
  return formations.slice(0, 5);
}

function extractDiplomeFromLine(line: string): string {
  const diplomes = ['BAC', 'BTS', 'DUT', 'Licence', 'Master', 'Doctorat', 'Ingénieur'];
  for (const diplome of diplomes) {
    if (line.toUpperCase().includes(diplome.toUpperCase())) {
      return diplome;
    }
  }
  return 'Diplôme';
}

function extractEtablissementFromLine(line: string): string {
  let etablissement = line
    .replace(/(bac|bts|dut|licence|master|doctorat|ingénieur)[^,\n]*/gi, '')
    .replace(/\d{4}.*$/, '')
    .replace(/[^\w\séèêëàâäôöûüç-]/gi, '')
    .trim();
  
  return etablissement || 'Établissement';
}

function extractLanguesProfessionnelles(text: string): any[] {
  const langues: any[] = [];
  
  const languesSection = text.match(/langues?([\s\S]*?)(?=\n\s*\n|$|compétences?|expériences?)/i);
  
  if (languesSection) {
    const languesText = languesSection[1];
    const lines = languesText.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        const langMatch = trimmed.match(/([A-Za-zéèêëàâäôöûüç]+)\s*(?:\(([^)]+)\))?/);
        if (langMatch) {
          langues.push({
            langue: langMatch[1],
            niveau: langMatch[2] || 'Intermédiaire'
          });
        }
      }
    }
  }
  
  if (langues.length === 0) {
    const commonLanguages = ['Français', 'Anglais', 'Espagnol', 'Allemand', 'Italien'];
    for (const langue of commonLanguages) {
      if (text.includes(langue)) {
        langues.push({ langue, niveau: 'Courant' });
      }
    }
  }
  
  return langues.slice(0, 5);
}

function determineNiveauProfessionnel(formations: any[], text: string): string {
  for (const formation of formations) {
    const diplome = formation.diplome?.toUpperCase() || '';
    
    if (diplome.includes('DOCTORAT') || diplome.includes('PHD')) return 'Bac+8';
    if (diplome.includes('MASTER') || diplome.includes('INGÉNIEUR')) return 'Bac+5';
    if (diplome.includes('LICENCE') || diplome.includes('BACHELOR')) return 'Bac+3';
    if (diplome.includes('BTS') || diplome.includes('DUT')) return 'Bac+2';
    if (diplome.includes('BAC')) return 'Bac';
  }
  
  if (text.includes('senior') || text.includes('expert')) return 'Senior';
  if (text.includes('confirmé')) return 'Confirmé';
  if (text.includes('junior')) return 'Junior';
  if (text.includes('débutant')) return 'Débutant';
  
  return 'À déterminer';
}

function calculerAnneesExperienceProfessionnel(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;
  
  const years = new Set<number>();
  
  experiences.forEach(exp => {
    if (exp.date_debut) {
      const year = parseInt(exp.date_debut);
      if (year >= 1970 && year <= 2025) {
        years.add(year);
      }
    }
    if (exp.date_fin && exp.date_fin.match(/\d{4}/)) {
      const year = parseInt(exp.date_fin);
      if (year >= 1970 && year <= 2025) {
        years.add(year);
      }
    }
  });
  
  if (years.size >= 2) {
    const yearArray = Array.from(years);
    const minYear = Math.min(...yearArray);
    const maxYear = Math.max(...yearArray);
    return maxYear - minYear;
  }
  
  return experiences.length; // Fallback
}

function getFallbackData(filename: string): any {
  const cleanName = filename.replace(/\.[^/.]+$/, '').replace(/CV[_\s-]*/i, '');
  const nameParts = cleanName.split(/[_\s-]+/).filter(p => p.length > 1);
  
  return {
    nom: nameParts.length > 0 ? nameParts[nameParts.length - 1] : '',
    prenom: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : 'Candidat',
    email: null,
    telephone: null,
    adresse: null,
    metiers: 'À déterminer',
    postes: 'À déterminer',
    entreprise: 'À déterminer',
    profil: `CV ${filename}`,
    competences: [],
    experiences: [],
    formations: [],
    langues: [],
    niveau: 'À déterminer',
    annees_experience: 0
  };
}

// ==================== FONCTION PRINCIPALE D'EXTRACTION ====================

async function extractCVData(buffer: Buffer, filename: string): Promise<any> {
  try {
    const rawText = await extractTextFromBuffer(buffer, filename);
    const cleanedText = cleanTextForDB(rawText);
    
    console.log(`🔍 Analyse CV: ${filename} (${cleanedText.length} caractères)`);
    
    // 1. Extraction NOM et PRENOM
    const { nom, prenom } = extractNomPrenomProfessionnel(cleanedText, filename);
    
    // 2. Extraction CONTACT
    const { email, telephone } = extractContactProfessionnel(cleanedText);
    
    // 3. Extraction ADRESSE
    const adresse = extractAdresseProfessionnelle(cleanedText);
    
    // 4. Extraction COMPÉTENCES (STRUCTURÉE)
    const competences = extractCompetencesProfessionnelles(cleanedText);
    
    // 5. Extraction EXPÉRIENCES avec DATES (STRUCTURÉE)
    const experiences = extractExperiencesProfessionnelles(cleanedText);
    
    // 6. Extraction FORMATIONS
    const formations = extractFormationsProfessionnelles(cleanedText);
    
    // 7. Extraction LANGUES
    const langues = extractLanguesProfessionnelles(cleanedText);
    
    // 8. Extraction METIERS/POSTES
    const { metiers, postes } = extractMetiersPostesProfessionnels(cleanedText, experiences);
    
    // 9. Extraction ENTREPRISE actuelle
    const entreprise = extractEntrepriseActuelle(experiences);
    
    // 10. Extraction PROFIL
    const profil = extractProfilProfessionnel(cleanedText);
    
    // 11. DÉTERMINER NIVEAU
    const niveau = determineNiveauProfessionnel(formations, cleanedText);
    
    // 12. CALCULER ANNÉES EXPÉRIENCE
    const anneesExperience = calculerAnneesExperienceProfessionnel(experiences);
    
    return {
      nom: nom || '',
      prenom: prenom || '',
      email: email || null,
      telephone: telephone || null,
      adresse: adresse || null,
      metiers: metiers || 'À déterminer',
      postes: postes || 'À déterminer',
      entreprise: entreprise || 'À déterminer',
      profil: profil || `CV ${filename}`,
      competences: competences,
      experiences: experiences,
      formations: formations,
      langues: langues,
      niveau: niveau || 'À déterminer',
      annees_experience: anneesExperience || 0
    };
    
  } catch (error) {
    console.error(`❌ Erreur extraction ${filename}:`, error);
    return getFallbackData(filename);
  }
}

// ==================== HANDLER PRINCIPAL ====================

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  
  try {
    const contentType = req.headers['content-type'] || '';
    let file_url = '';
    let fileBuffer: Buffer;
    let filename = 'cv';
    
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
      
      console.log(`📄 Téléchargement CV: ${file_url}`);
      
      const response = await fetch(file_url);
      if (!response.ok) throw new Error(`Échec téléchargement: ${response.status}`);
      
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      filename = file_url.split('/').pop() || 'cv';
      
    } else if (contentType.includes('multipart/form-data')) {
      const form = new IncomingForm();
      const [, files] = await new Promise<[any, any]>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });
      
      const file = files.file as any;
      if (!file) return res.status(400).json({ error: 'Fichier manquant' });
      
      filename = file.originalFilename || file.newFilename;
      fileBuffer = await readFile(file.filepath);
      fs.unlinkSync(file.filepath);
      
    } else {
      return res.status(400).json({ error: 'Content-Type non supporté' });
    }
    
    const extractedData = await extractCVData(fileBuffer, filename);
    console.log(`✅ Extraction réussie:`, {
      nom: extractedData.nom,
      prenom: extractedData.prenom,
      email: extractedData.email ? 'OUI' : 'NON',
      telephone: extractedData.telephone ? 'OUI' : 'NON',
      metiers: extractedData.metiers,
      competences_count: extractedData.competences.length,
      experiences_count: extractedData.experiences.length
    });
    
    const uniqueId = generateUniqueId(filename);
    const rawText = fileBuffer.toString('utf8', 0, 5000);
    
       
    const candidatData: any = {
      nom: extractedData.nom,
      prenom: extractedData.prenom,
      email: extractedData.email,
      telephone: extractedData.telephone,
      adresse: extractedData.adresse,
      metiers: extractedData.metiers,
      postes: extractedData.postes,
      entreprise: extractedData.entreprise,
      profil: extractedData.profil,
      
      fichier: uniqueId,
      cv_url: file_url,
      cv_filename: filename,
      raw_text: cleanTextForDB(rawText),
      
      niveau: extractedData.niveau,
      annees_experience: extractedData.annees_experience,
      competences: extractedData.competences,
      formations: extractedData.formations,
      experiences: extractedData.experiences,
      langues: extractedData.langues,
      
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('💾 Sauvegarde dans Supabase...');
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
        extraction: extractedData
      });
    }
    
    console.log(`✅ Candidat ${savedData.id} sauvegardé`);
    
    return res.status(200).json({
      success: true,
      candidat_id: savedData.id,
      candidat: {
        nom: extractedData.nom,
        prenom: extractedData.prenom,
        email: extractedData.email,
        telephone: extractedData.telephone,
        adresse: extractedData.adresse,
        metiers: extractedData.metiers,
        postes: extractedData.postes,
        entreprise: extractedData.entreprise,
        profil: extractedData.profil
      },
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