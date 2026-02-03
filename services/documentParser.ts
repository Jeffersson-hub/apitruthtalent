// services/documentParser.ts - VERSION CORRIGÉE
import type Candidat from '../types/candidats';
import type { Experience, Formation, Langue } from '../types/candidats';

// Interface pour les données extraites
interface ExtractedCVData {
  nom?: string | null;
  prenom?: string | null;
  nom_complet?: string | null;
  email?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  linkedin?: string | null;
  poste?: string | null;
  entreprise?: string | null;
  profil?: string | null;
  niveau?: string | null;
  annees_experience?: number;
  competences: string[];
  metiers: string[];
  experiences: Experience[];
  formations: Formation[];
  langues: Langue[];
  raw_text?: string;
  confidence_score?: number;
  extraction_errors: string[];
}

export async function parseCV(
  buffer: Buffer,
  filename: string,
  fileType: string
): Promise<{
  candidat: Candidat;
  confidence_score: number;
  raw_text?: string;
  metadata?: Record<string, any>;
}> {
  
  console.log(`🧠 Début parsing du CV: ${filename}`);
  
  // 1. Extraire le texte brut du CV
  const rawText = await extractTextFromBuffer(buffer, fileType);
  
  if (!rawText || rawText.trim().length < 50) {
    throw new Error('CV trop court ou impossible à extraire');
  }
  
  // 2. Analyser le texte pour extraire les données
  const extractedData = await extractCVData(rawText, filename);
  
  // 3. Structurer les données selon votre interface Candidat
  const candidat = buildCandidatFromExtractedData(extractedData, filename, fileType);
  
  // 4. Calculer le score de confiance
  const confidenceScore = calculateConfidenceScore(candidat, extractedData);
  
  return {
    candidat,
    confidence_score: confidenceScore,
    raw_text: rawText.substring(0, 10000),
    metadata: {
      filename,
      file_type: fileType,
      file_size: buffer.length,
      extraction_date: new Date().toISOString(),
      parser_version: '1.0'
    }
  };
}

// ============================================
// FONCTION : EXTRACTION DU TEXTE
// ============================================
async function extractTextFromBuffer(buffer: Buffer, fileType: string): Promise<string> {
  try {
    console.log('📄 Extraction texte...');
    
    if (fileType.includes('pdf') || fileType === 'application/pdf') {
      // Pour PDF
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
      
    } else if (fileType.includes('word') || 
               fileType.includes('msword') || 
               fileType.includes('document')) {
      // Pour Word DOC/DOCX
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
      
    } else if (fileType.includes('image')) {
      throw new Error('OCR non implémenté. Utilisez un service externe.');
      
    } else {
      // Texte brut
      return buffer.toString('utf-8');
    }
  } catch (error: unknown) {
    console.error('❌ Erreur extraction texte:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    throw new Error(`Échec extraction texte: ${errorMessage}`);
  }
}

// ============================================
// FONCTION : EXTRACTION DES DONNÉES DU CV
// ============================================
async function extractCVData(rawText: string, filename: string): Promise<ExtractedCVData> {
  console.log('🔍 Analyse du texte...');
  
  const data: ExtractedCVData = {
    competences: [],
    metiers: [],
    experiences: [],
    formations: [],
    langues: [],
    extraction_errors: []
  };
  
  try {
    // Nettoyer le texte
    const cleanText = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/[^\S\r\n]+/g, ' ');
    
    // 1. Extraire email
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = cleanText.match(emailRegex) || [];
    if (emails.length > 0) {
      data.email = emails[0];
      console.log('📧 Email trouvé:', data.email);
    }
    
    // 2. Extraire téléphone (formats français) - CORRIGÉ
    const phoneRegex = /(?:(?:\+|00)33|0)[\s.-]*[1-9](?:[\s.-]*\d{2}){4}/g;
    const phones = cleanText.match(phoneRegex) || [];
    if (phones.length > 0 && phones[0]) {
      data.telephone = formatPhoneNumber(phones[0]);
      console.log('📱 Téléphone trouvé:', data.telephone);
    }
    
    // 3. Extraire nom et prénom
    const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
    
    for (const line of lines.slice(0, 10)) {
      const cleanLine = line.trim();
      
      if (cleanLine.length > 3 && cleanLine.length < 50 && 
          !/\d/.test(cleanLine) && 
          (cleanLine === cleanLine.toUpperCase() || 
           /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(cleanLine))) {
        
        const nameParts = cleanLine.split(/\s+/);
        if (nameParts.length >= 2) {
          data.prenom = nameParts[0];
          data.nom = nameParts.slice(1).join(' ');
          console.log('👤 Nom trouvé:', data.nom, data.prenom);
          break;
        }
      }
    }
    
    // 4. Extraire compétences
    const technicalKeywords = [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'PHP', 'Ruby', 
      'React', 'Angular', 'Vue.js', 'Node.js', 'Express', 'Spring',
      'MySQL', 'PostgreSQL', 'MongoDB', 'AWS', 'Azure', 'Docker',
      'Développeur', 'Ingénieur', 'Consultant', 'Manager', 'Data Scientist'
    ];
    
    const foundSkills: string[] = [];
    const foundJobs: string[] = [];
    
    for (const keyword of technicalKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      if (regex.test(cleanText)) {
        if (keyword.length <= 3 || ['AWS', 'C#', 'C++'].includes(keyword)) {
          foundSkills.push(keyword);
        } else {
          foundJobs.push(keyword);
        }
      }
    }
    
    data.competences = [...new Set(foundSkills)];
    data.metiers = [...new Set(foundJobs)];
    
    // 5. Extraire expériences
    const experienceSections = extractExperienceSections(cleanText);
    data.experiences = experienceSections;
    
    // 6. Extraire formations - CORRIGÉ
    const educationSections = extractEducationSections(cleanText);
    data.formations = educationSections;
    
    // 7. Extraire langues
    const languages = extractLanguages(cleanText);
    data.langues = languages;
    
    // 8. Extraire poste actuel
    const jobTitles = ['Développeur', 'Ingénieur', 'Consultant', 'Manager', 'Directeur'];
    
    for (const title of jobTitles) {
      const regex = new RegExp(`\\b${title}\\b.*?(?:chez|à|at)\\s+([A-Z][a-zA-Z\\s&]+)`, 'i');
      const match = cleanText.match(regex);
      if (match && match[1]) {
        data.poste = title;
        data.entreprise = match[1].trim();
        break;
      }
    }
    
    // 9. Calculer années d'expérience
    if (data.experiences && data.experiences.length > 0) {
      data.annees_experience = calculateYearsOfExperience(data.experiences);
    }
    
    // 10. Extraire profil
    const paragraphs = cleanText.split('\n\n').filter(p => p.trim().length > 50);
    if (paragraphs.length > 0) {
      data.profil = paragraphs[0].substring(0, 500);
    }
    
    console.log(`✅ Données extraites: ${Object.keys(data).length} champs`);
    
  } catch (error: unknown) {
    console.error('❌ Erreur extraction données:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    data.extraction_errors.push(`Erreur extraction: ${errorMessage}`);
  }
  
  return data;
}

// ============================================
// FONCTION : CONSTRUIRE L'OBJET CANDIDAT
// ============================================
function buildCandidatFromExtractedData(
  extracted: ExtractedCVData,
  filename: string,
  fileType: string
): Candidat {
  
  let nom = extracted.nom || null;
  let prenom = extracted.prenom || null;
  
  if (!nom && extracted.nom_complet) {
    const nameParts = (extracted.nom_complet || '').split(' ');
    prenom = nameParts[0] || null;
    nom = nameParts.slice(1).join(' ') || null;
  }
  
  if (!nom) {
    nom = filename.replace(/\.[^/.]+$/, '');
  }
  
  // CORRECTION : Créer l'objet avec tous les champs requis
  const candidat: Candidat = {
    fichier: filename,
    nom: nom,
    prenom: prenom,
    email: extracted.email || null,
    telephone: extracted.telephone || null,
    poste: extracted.poste || null,
    entreprise: extracted.entreprise || null,
    profil: extracted.profil || null,
    competences: extracted.competences || [],
    metiers: extracted.metiers || [],
    experiences: extracted.experiences || [],
    formations: extracted.formations || [],
    langues: extracted.langues || [],
    adresse: extracted.adresse || null,
    linkedin: extracted.linkedin || null,
    niveau: extracted.niveau || null,
    annees_experience: extracted.annees_experience || 0,
    confidence_score: extracted.confidence_score || 0,
    cv_filename: filename,
    file_type: fileType,
    raw_text: extracted.raw_text?.substring(0, 5000),
    date_analyse: new Date().toISOString(),
    statut: 'analysé',
    source: 'parsing_vercel'
  };
  
  return candidat;
}

// ============================================
// FONCTIONS UTILITAIRES - CORRIGÉES
// ============================================

function formatPhoneNumber(phone: string): string {
  return phone.replace(/\s+/g, '').replace(/\./g, '').replace(/-/g, '');
}

function extractExperienceSections(text: string): Experience[] {
  const experiences: Experience[] = [];
  
  const expKeywords = ['EXPÉRIENCE', 'EXPÉRIENCES', 'EXPERIENCE', 'EXPERIENCES'];
  const keywordPattern = expKeywords.join('|');
  
  for (const keyword of expKeywords) {
    const regex = new RegExp(`${keyword}[\\s\\S]*?(?=(?:${keywordPattern}|FORMATION|EDUCATION|COMPETENCES|$))`, 'i');
    const match = text.match(regex);
    
    if (match) {
      const expSection = match[0];
      const lines = expSection.split('\n').filter(line => line.trim().length > 10);
      
      for (const line of lines) {
        if (line.match(/(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|\d{4})/i)) {
          const exp = parseExperienceLine(line);
          if (exp) {
            experiences.push(exp);
          }
        }
      }
      break;
    }
  }
  
  return experiences;
}

function parseExperienceLine(line: string): Experience | null {
  try {
    const parts = line.split('|').map(p => p.trim());
    
    if (parts.length >= 3) {
      const dateStr = parts[0] || '';
      const startDate = extractDateFromString(dateStr);
      
      return {
        entreprise: parts[2] || 'Inconnu',
        poste: parts[1] || 'Non spécifié',
        debut: startDate || new Date().toISOString(),
        fin: startDate || null,
        description: null
      };
    }
  } catch (e) {
    console.log('Erreur parsing ligne expérience:', e);
  }
  return null;
}

function extractEducationSections(text: string): Formation[] {
  const formations: Formation[] = [];
  
  const eduKeywords = ['FORMATION', 'FORMATIONS', 'EDUCATION', 'DIPLÔMES'];
  const keywordPattern = eduKeywords.join('|');
  
  for (const keyword of eduKeywords) {
    const regex = new RegExp(`${keyword}[\\s\\S]*?(?=(?:${keywordPattern}|EXPÉRIENCE|COMPETENCES|$))`, 'i');
    const match = text.match(regex);
    
    if (match) {
      const eduSection = match[0];
      const lines = eduSection.split('\n').filter(line => line.trim().length > 10);
      
      for (const line of lines) {
        if (line.match(/\d{4}/) && line.match(/(Master|Licence|Bachelor|Diplôme|Doctorat|Ingénieur)/i)) {
          const formation = parseEducationLine(line);
          if (formation) {
            formations.push(formation);
          }
        }
      }
      break;
    }
  }
  
  return formations;
}

function parseEducationLine(line: string): Formation | null {
  try {
    const parts = line.split('|').map(p => p.trim());
    
    if (parts.length >= 3) {
      const dateStr = parts[0] || '';
      const dateObtention = extractDateFromString(dateStr);
      
      return {
        etablissement: parts[2] || 'Inconnu',
        diplome: parts[1] || 'Non spécifié',
        date_obtention: dateObtention || new Date().toISOString(),
        domaine: null
      };
    }
  } catch (e: unknown) {
    console.log('Erreur parsing ligne formation:', e);
  }
  return null;
}

function extractLanguages(text: string): Langue[] {
  const langues: Langue[] = [];
  
  const langSectionRegex = /LANGUES?[:\s]+([\s\S]*?)(?=(?:COMPETENCES|CENTRE D'INTÉRÊT|$))/i;
  const match = text.match(langSectionRegex);
  
  if (match && match[1]) {
    const langText = match[1];
    const languageRegex = /([A-Z][a-z]+)\s*[:\-]?\s*([A-Z][a-zéèêûîôàâ]+)/gi;
    let langMatch: RegExpExecArray | null;
    
    while ((langMatch = languageRegex.exec(langText)) !== null) {
      langues.push({
        langue: langMatch[1],
        niveau: langMatch[2],
        certification: false
      });
    }
  }
  
  const commonLanguages = ['Anglais', 'Français', 'Espagnol', 'Allemand', 'Italien'];
  
  for (const lang of commonLanguages) {
    const regex = new RegExp(`\\b${lang}\\b.*?(Courant|Intermédiaire|Débutant|Bilingue|Natif)`, 'i');
    const match = text.match(regex);
    
    if (match && match[1] && !langues.some(l => l.langue === lang)) {
      langues.push({
        langue: lang,
        niveau: match[1],
        certification: false
      });
    }
  }
  
  return langues;
}

function extractDateFromString(dateStr: string): string | null {
  try {
    const yearMatch = dateStr.match(/\b(20\d{2})\b/);
    if (yearMatch && yearMatch[1]) {
      return `${yearMatch[1]}-01-01T00:00:00.000Z`;
    }
  } catch (e) {
    // Ignorer les erreurs de parsing de date
  }
  return null;
}

function calculateYearsOfExperience(experiences: Experience[]): number {
  let totalYears = 0;
  
  for (const exp of experiences) {
    if (exp.debut) {
      const start = new Date(exp.debut);
      const end = exp.fin ? new Date(exp.fin) : new Date();
      const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      totalYears += Math.max(0, years);
    }
  }
  
  return Math.round(totalYears * 10) / 10;
}

function calculateConfidenceScore(candidat: Candidat, extracted: ExtractedCVData): number {
  let score = 0;
  let maxScore = 0;
  
  // Nom + Prénom
  maxScore += 20;
  if (candidat.nom && candidat.prenom) score += 20;
  else if (candidat.nom || candidat.prenom) score += 10;
  
  // Email
  maxScore += 15;
  if (candidat.email) score += 15;
  
  // Téléphone
  maxScore += 10;
  if (candidat.telephone) score += 10;
  
  // Expériences
  maxScore += 20;
  if (candidat.experiences && candidat.experiences.length > 0) score += 20;
  
  // Compétences
  maxScore += 15;
  if (candidat.competences && candidat.competences.length >= 3) score += 15;
  else if (candidat.competences && candidat.competences.length > 0) score += 5;
  
  // Formations
  maxScore += 10;
  if (candidat.formations && candidat.formations.length > 0) score += 10;
  
  // Poste actuel
  maxScore += 10;
  if (candidat.poste) score += 10;
  
  return maxScore > 0 ? Math.round((score / maxScore) * 100) / 100 : 0;
}

export default { parseCV };