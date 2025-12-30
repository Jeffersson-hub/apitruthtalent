// pages/api/parse.ts - VERSION CORRIGÉE
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

// ==================== EXTRACTION PROFESSIONNELLE ====================

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
    
    // 4. Extraction METIERS et POSTES
    const { metiers, postes } = extractMetiersPostesProfessionnels(cleanedText);
    
    // 5. Extraction ENTREPRISE actuelle
    const entreprise = extractEntrepriseActuelle(cleanedText);
    
    // 6. Extraction PROFIL
    const profil = extractProfilProfessionnel(cleanedText);
    
    // 7. Extraction COMPÉTENCES
    const competences = extractCompetencesProfessionnelles(cleanedText);
    
    // 8. Extraction EXPÉRIENCES
    const experiences = extractExperiencesProfessionnelles(cleanedText);
    
    // 9. Extraction FORMATIONS
    const formations = extractFormationsProfessionnelles(cleanedText);
    
    // 10. Extraction LANGUES
    const langues = extractLanguesProfessionnelles(cleanedText);
    
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
      competences: competences || [],
      experiences: experiences || [],
      formations: formations || [],
      langues: langues || [],
      niveau: niveau || 'À déterminer',
      annees_experience: anneesExperience || 0
    };
    
  } catch (error) {
    console.error(`❌ Erreur extraction ${filename}:`, error);
    return getFallbackData(filename);
  }
}

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

// ==================== FONCTIONS D'EXTRACTION ====================

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

function extractMetiersPostesProfessionnels(text: string): { metiers: string; postes: string } {
  const metiersList = [
    'Développeur', 'Ingénieur', 'Consultant', 'Analyste', 'Architecte',
    'Chef de projet', 'Manager', 'Directeur', 'Designer', 'Commercial',
    'Marketing', 'Vendeur', 'Assistant', 'Technicien', 'Administrateur',
    'Data Scientist', 'DevOps', 'Webmaster', 'Community Manager', 'Recruteur'
  ];
  
  const postesList = [
    'Fullstack', 'Frontend', 'Backend', 'Senior', 'Junior', 'Confirmé',
    'Web', 'Mobile', 'Cloud', 'Sécurité', 'Réseau', 'Base de données',
    'Lead', 'Principal', 'Expert', 'Spécialiste', 'Responsable'
  ];
  
  const foundMetiers = new Set<string>();
  const foundPostes = new Set<string>();
  
  for (const metier of metiersList) {
    if (text.toLowerCase().includes(metier.toLowerCase())) {
      foundMetiers.add(metier);
    }
  }
  
  for (const poste of postesList) {
    if (text.toLowerCase().includes(poste.toLowerCase())) {
      foundPostes.add(poste);
    }
  }
  
  const experienceSection = text.match(/expériences? professionnelles?([\s\S]*?)(?=\n\s*\n|formations?|compétences?|$)/i);
  if (experienceSection) {
    const expText = experienceSection[1];
    for (const metier of metiersList) {
      if (expText.toLowerCase().includes(metier.toLowerCase())) {
        foundMetiers.add(metier);
      }
    }
  }
  
  return {
    metiers: Array.from(foundMetiers).slice(0, 3).join(', ') || 'À déterminer',
    postes: Array.from(foundPostes).slice(0, 3).join(', ') || 'À déterminer'
  };
}

function extractEntrepriseActuelle(text: string): string {
  const lines = text.split('\n');
  let currentCompany = 'À déterminer';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const chezMatch = line.match(/chez\s+([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]+)/i);
    if (chezMatch) {
      currentCompany = chezMatch[1].trim();
      continue;
    }
    
    if (line.match(/\b(19|20)\d{2}\b/)) {
      const companyMatch = line.match(/(?:chez|à|@)\s+([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]{3,50})/i);
      if (companyMatch) {
        currentCompany = companyMatch[1].trim();
      }
    }
  }
  
  return currentCompany;
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

function extractCompetencesProfessionnelles(text: string): string[] {
  console.log('🔍 Extraction structurée des compétences...');
  const competences: string[] = [];
  
  // Normaliser le texte pour la recherche
  const lines = text.split('\n').map(line => line.trim());
  
  // 1. Chercher la section COMPÉTENCES avec différentes variantes
  const sectionHeaders = [
    'COMPÉTENCES',
    'COMPETENCES', 
    'SKILLS',
    'APTITUDES',
    'QUALIFICATIONS',
    'SAVOIR-FAIRE',
    'COMPÉTENCES TECHNIQUES',
    'COMPETENCES TECHNIQUES',
    'TECHNICAL SKILLS',
    'HARD SKILLS'
  ];
  
  let sectionStart = -1;
  let sectionEnd = -1;
  
  // Trouver le début de la section
  for (let i = 0; i < lines.length; i++) {
    const lineUpper = lines[i].toUpperCase().trim();
    
    for (const header of sectionHeaders) {
      if (lineUpper.startsWith(header) || lineUpper === header) {
        sectionStart = i + 1; // Commencer après le titre
        console.log(`📋 Section "${header}" trouvée à la ligne ${i}`);
        break;
      }
    }
    
    if (sectionStart !== -1) break;
  }
  
  // Si pas trouvé de section, chercher par pattern plus large
  if (sectionStart === -1) {
    const skillsPattern = /compétences?[:\s]*([^\n]+(?:\n[^\n]+){0,10})/i;
    const match = text.match(skillsPattern);
    
    if (match) {
      const skillsText = match[0];
      const skillLines = skillsText.split('\n');
      sectionStart = 1; // Après le titre
      sectionEnd = skillLines.length;
      console.log('📋 Compétences trouvées via pattern');
    }
  }
  
  // 2. Extraire les compétences de la section
  if (sectionStart !== -1) {
    // Déterminer la fin de la section (prochaine section majeure)
    if (sectionEnd === -1) {
      const nextSectionHeaders = [
        'EXPÉRIENCE', 'EXPERIENCE', 'FORMATION', 'EDUCATION',
        'LANGUES', 'LANGUAGES', 'PROJETS', 'PROJECTS',
        'CENTRE D\'INTÉRÊT', 'INTERETS', 'CERTIFICATIONS'
      ];
      
      for (let i = sectionStart; i < Math.min(sectionStart + 30, lines.length); i++) {
        const lineUpper = lines[i].toUpperCase().trim();
        
        // Vérifier si c'est le début d'une nouvelle section
        let isNewSection = false;
        for (const header of nextSectionHeaders) {
          if (lineUpper.startsWith(header) || lineUpper === header) {
            isNewSection = true;
            break;
          }
        }
        
        // Vérifier aussi les lignes vides suivies d'un titre
        if (lineUpper === '' && i + 1 < lines.length) {
          const nextLineUpper = lines[i + 1].toUpperCase().trim();
          for (const header of nextSectionHeaders) {
            if (nextLineUpper.startsWith(header) || nextLineUpper === header) {
              isNewSection = true;
              break;
            }
          }
        }
        
        if (isNewSection) {
          sectionEnd = i;
          break;
        }
      }
      
      // Si pas trouvé, prendre les 20 lignes suivantes
      if (sectionEnd === -1) {
        sectionEnd = Math.min(sectionStart + 20, lines.length);
      }
    }
    
    console.log(`📋 Extraction lignes ${sectionStart} à ${sectionEnd}`);
    
    // 3. Analyser chaque ligne de la section
    for (let i = sectionStart; i < sectionEnd; i++) {
      const line = lines[i];
      if (!line || line.trim() === '') continue;
      
      // Format 1: Ligne avec tirets/puces
      if (line.match(/^[-•*●○■□►▸]\s/)) {
        const content = line.replace(/^[-•*●○■□►▸]\s+/, '').trim();
        extractFromLine(content, competences);
      }
      // Format 2: Ligne numérotée
      else if (line.match(/^\d+[\.\)]\s/)) {
        const content = line.replace(/^\d+[\.\)]\s+/, '').trim();
        extractFromLine(content, competences);
      }
      // Format 3: Ligne normale (peut contenir plusieurs compétences)
      else {
        extractFromLine(line, competences);
      }
    }
  }
  
  // 4. Si peu de compétences trouvées, chercher les compétences techniques courantes
  if (competences.length < 3) {
    console.log('🔍 Recherche des compétences techniques courantes...');
    const technicalSkills = [
      // Langages
      'JavaScript', 'TypeScript', 'Python', 'Java', 'PHP', 'C#', 'C++', 'Ruby', 'Go', 'Swift',
      'Kotlin', 'Scala', 'R', 'MATLAB', 'SQL', 'HTML', 'CSS', 'SASS', 'LESS',
      // Frameworks
      'React', 'Angular', 'Vue.js', 'Next.js', 'Nuxt.js', 'Node.js', 'Express', 'Django',
      'Flask', 'Spring', 'Laravel', 'Symfony', 'Ruby on Rails', 'Bootstrap', 'Tailwind',
      // Bases de données
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQL Server',
      // Outils
      'Git', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Jenkins', 'Jira', 'Figma'
    ];
    
    const textLower = text.toLowerCase();
    technicalSkills.forEach(skill => {
      if (textLower.includes(skill.toLowerCase()) && !competences.includes(skill)) {
        competences.push(skill);
      }
    });
  }
  
  // 5. Nettoyer et formater
  const cleaned = cleanCompetences(competences);
  console.log(`✅ ${cleaned.length} compétences extraites:`, cleaned.slice(0, 5));
  
  return cleaned;
}

// Fonction pour extraire les compétences d'une ligne
function extractFromLine(line: string, competences: string[]): void {
  // Séparateurs possibles
  const separators = /[,;/\|•\-]\s*/;
  
  // Si la ligne contient des séparateurs, diviser
  if (line.match(separators)) {
    const parts = line.split(separators);
    parts.forEach(part => {
      const trimmed = cleanCompetenceText(part.trim());
      if (isValidCompetence(trimmed)) {
        competences.push(trimmed);
      }
    });
  } else {
    // Sinon, traiter la ligne entière
    const cleaned = cleanCompetenceText(line);
    if (isValidCompetence(cleaned)) {
      competences.push(cleaned);
    }
  }
}

// Fonction pour nettoyer le texte d'une compétence
function cleanCompetenceText(text: string): string {
  if (!text) return '';
  
  // Supprimer les parenthèses et leur contenu
  let cleaned = text.replace(/\([^)]*\)/g, '');
  
  // Supprimer les niveaux (débutant, intermédiaire, expert)
  cleaned = cleaned.replace(/\b(débutant|intermédiaire|expert|junior|senior|confirmé)\b/gi, '');
  
  // Supprimer les années d'expérience
  cleaned = cleaned.replace(/\d+\s*(ans?|années?)/gi, '');
  
  // Supprimer les pourcentages
  cleaned = cleaned.replace(/\d+%/g, '');
  
  // Capitaliser la première lettre
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned.trim();
}

// Fonction pour valider une compétence
function isValidCompetence(text: string): boolean {
  if (!text || text.length < 2 || text.length > 50) return false;
  
  const lower = text.toLowerCase();
  
  // Exclure les éléments non pertinents
  const excluded = [
    // Mots trop courts ou génériques
    'et', 'ou', 'de', 'du', 'des', 'le', 'la', 'les', 'à', 'au', 'aux',
    // Références temporelles
    'ans', 'années', 'année', 'mois',
    // Références à l'expérience
    'expérience', 'expériences', 'stage', 'stages', 'alternance', 'mission',
    // Titres de postes (gérés séparément)
    'développeur', 'ingénieur', 'consultant', 'manager', 'chef', 'directeur',
    'analyste', 'architecte', 'designer', 'commercial', 'technicien'
  ];
  
  if (excluded.includes(lower)) return false;
  
  // Exclure les phrases complètes (trop de mots)
  const words = text.split(/\s+/);
  if (words.length > 5) return false;
  
  // Exclure les éléments avec chiffres (sauf pour les versions comme HTML5)
  if (text.match(/\d+/) && !text.match(/[a-zA-Z]+\d+/)) {
    return false;
  }
  
  return true;
}

// Fonction de nettoyage final
function cleanCompetences(competences: string[]): string[] {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  
  for (const comp of competences) {
    if (!comp || comp.trim() === '') continue;
    
    const trimmed = comp.trim();
    
    // Ignorer les doublons (insensible à la casse)
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    
    // Vérifier la validité finale
    if (isValidCompetence(trimmed)) {
      cleaned.push(trimmed);
      seen.add(lower);
    }
  }
  
  return cleaned.slice(0, 15); // Limiter à 15 compétences
}

function extractExperiencesProfessionnelles(text: string): any[] {
  const experiences: any[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const datePattern = /(\d{4})\s*[-–àà]\s*(\d{4}|présent|aujourd'hui)/i;
    const dateMatch = line.match(datePattern);
    
    if (dateMatch && line.length > 20) {
      const experience: any = {
        periode: dateMatch[0],
        entreprise: extractCompanyFromExperienceLine(line),
        poste: extractJobTitleFromExperienceLine(line),
        description: ''
      };
      
      let j = i + 1;
      while (j < lines.length && j < i + 10) {
        const nextLine = lines[j].trim();
        if (nextLine.startsWith('-') || nextLine.startsWith('•')) {
          experience.description += nextLine.replace(/^[-•]\s*/, '') + ' ';
        } else if (nextLine && nextLine.length < 100 && !nextLine.match(datePattern)) {
          experience.description += nextLine + ' ';
        } else {
          break;
        }
        j++;
      }
      
      experiences.push(experience);
      i = j - 1;
    }
  }
  
  return experiences.slice(0, 10);
}

function extractCompanyFromExperienceLine(line: string): string {
  const patterns = [
    /chez\s+([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]+)/i,
    /à\s+([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]+)/i,
    /@\s+([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]+)/i,
    /,\s+([A-Z][A-Za-zéèêëàâäôöûüç\s&.-]+)$/i
  ];
  
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return 'Entreprise';
}

function extractJobTitleFromExperienceLine(line: string): string {
  const beforeCompany = line.split(/chez|à|@|,/i)[0].trim();
  
  const words = beforeCompany.split(/\s+/);
  const significantWords = words.filter(word => 
    word.length > 3 && 
    !word.match(/^\d/) &&
    !['de', 'du', 'des', 'le', 'la', 'les', 'et', 'ou', 'à'].includes(word.toLowerCase())
  );
  
  return significantWords.join(' ') || 'Poste';
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
  
  for (const exp of experiences) {
    const yearMatches = exp.periode?.match(/\b(19|20)\d{2}\b/g);
    if (yearMatches) {
      yearMatches.forEach((year: string) => {
        const y = parseInt(year);
        if (y >= 1970 && y <= 2025) {
          years.add(y);
        }
      });
    }
  }
  
  if (years.size >= 2) {
    const yearArray = Array.from(years);
    const minYear = Math.min(...yearArray);
    const maxYear = Math.max(...yearArray);
    return Math.min(maxYear - minYear, 30);
  }
  
  return Math.min(experiences.length * 2, 20);
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
      metiers: extractedData.metiers
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