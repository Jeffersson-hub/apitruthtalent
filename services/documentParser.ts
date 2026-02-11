// services/documentParser.ts
import pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import nlp from 'compromise';
import { chrono } from 'chrono-node';

export interface Experience {
  periode: string;
  poste: string;
  entreprise: string;
  description?: string;
}

export interface Formation {
  periode: string;
  diplome: string;
  etablissement: string;
  description?: string;
}

export interface Adresse {
  rue?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  complete?: string;
}

export interface Langue {
  langue: string;
  niveau?: string;
}

export interface CandidatData {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  competences: string[];
  metiers: string[];
  experiences: Experience[];
  formations: Formation[];
  langues: Langue[];
  adresse?: string | Adresse;
  profil?: string;
  raw_text?: string;
  metadata?: {
    filename: string;
    filetype: string;
    extraction_date: string;
  };
}

export interface ParseCVResult {
  candidat: CandidatData;
  confidence_score: number;
  extraction_details?: {
    adresse: { found: boolean; confidence: number };
    experiences: { count: number; confidence: number };
    formations: { count: number; confidence: number };
  };
}

// ==================== FONCTION PRINCIPALE ====================

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
    
    // 2. Analyser le texte avec les différentes extracteurs
    const [
      email,
      telephone,
      nomPrenom,
      adresse,
      competences,
      metiers,
      experiences,
      formations,
      langues,
      posteActuel,
      profil
    ] = await Promise.all([
      extractEmail(rawText),
      extractPhone(rawText),
      extractNameFromText(rawText),
      extractAddress(rawText),
      extractSkills(rawText),
      extractMetiers(rawText),
      extractExperiences(rawText),
      extractFormations(rawText),
      extractLanguages(rawText),
      extractCurrentPosition(rawText),
      extractProfil(rawText)
    ]);

    // 3. Extraire entreprise du poste actuel ou de la dernière expérience
    const entreprise = extractCurrentCompany(rawText, experiences);

    // 4. Construire l'objet candidat
    const candidatData: CandidatData = {
      nom: nomPrenom.nom,
      prenom: nomPrenom.prenom,
      email,
      telephone: telephone || undefined,
      poste: posteActuel || undefined,
      entreprise: entreprise || undefined,
      adresse: adresse || undefined,
      competences,
      metiers,
      experiences,
      formations,
      langues,
      profil: profil || undefined,
      raw_text: rawText.substring(0, 2000), // Limiter la taille
      metadata: {
        filename,
        filetype: fileType,
        extraction_date: new Date().toISOString()
      }
    };
    
    // 5. Calculer les scores de confiance
    const confidence_score = calculateConfidenceScore(candidatData);
    const extraction_details = {
      adresse: { found: !!adresse, confidence: adresse ? 0.7 : 0 },
      experiences: { count: experiences.length, confidence: experiences.length > 0 ? 0.8 : 0 },
      formations: { count: formations.length, confidence: formations.length > 0 ? 0.9 : 0 }
    };
    
    console.log('📊 Résultats extraction:', {
      nom: candidatData.nom,
      prenom: candidatData.prenom,
      email: candidatData.email,
      adresse: !!candidatData.adresse,
      experiences: candidatData.experiences?.length,
      formations: candidatData.formations?.length
    });
    
    return {
      candidat: candidatData,
      confidence_score,
      extraction_details
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

// ==================== EXTRACTION DE TEXTE ====================

async function extractTextFromBuffer(
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<string> {
  console.log(`📄 Extraction texte: ${filename} (${fileType})`);
  
  try {
    // PDF
    if (fileType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      const pdfData = await pdf(buffer);
      return pdfData.text || '';
    }
    
    // DOCX
    if (fileType.includes('word') || filename.toLowerCase().endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    }
    
    // TXT et autres
    return buffer.toString('utf-8');
    
  } catch (error: any) {
    console.error(`⚠️ Erreur extraction ${filename}:`, error.message);
    
    // Fallback: essayer de lire comme texte brut
    try {
      return buffer.toString('utf-8');
    } catch {
      throw new Error(`Impossible d'extraire le texte: ${error.message}`);
    }
  }
}

// ==================== EXTRACTION ADRESSE (AMÉLIORÉE) ====================

function extractAddress(text: string): string {
  const patterns = [
    /(?:basé|habite|réside|adresse)[:\s\n]+([A-Za-zÀ-ÿ\s\-']+)/i,  // "Basé dans l’Hérault"
    /\b\d{5}\s+[A-Za-zÀ-ÿ\s\-']+/g,  // Code postal + ville
    /([A-Za-zÀ-ÿ\s\-']+)\s+\(?\d{5}\)?/g  // Ville (code postal)
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return '';
}

// ==================== EXTRACTION EXPÉRIENCES (AMÉLIORÉE) ====================
function extractExperiences(text: string): Array<{ periode: string; poste: string; entreprise: string }> {
  const experiences = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const dates = chrono.fr.parse(line, new Date());
    if (dates.length > 0) {
      const periode = dates.map((d: { text: any; }) => d.text).join(' – ');
      if (i + 1 < lines.length) {
        const posteLine = lines[i + 1].trim();
        if (i + 2 < lines.length) {
          const entrepriseLine = lines[i + 2].trim();
          experiences.push({ periode, poste: posteLine, entreprise: entrepriseLine });
          i += 2;
        }
      }
    }
  }
  return experiences;
}


// ==================== EXTRACTION FORMATIONS (AMÉLIORÉE) ====================

export async function extractFormations(text: string): Promise<Formation[]> {
  console.log('🎓 Recherche des formations...');
  
  const formations: Formation[] = [];
  
  // Détecter la section formations
  const sectionMatch = text.match(/(?:formations?|diplômes?|études?|parcours\s*académique|éducation)[\s:]*([^]*?)(?=\n\s*(?:expériences?|compétences?|langues?|$))/i);
  
  const textToAnalyze = sectionMatch ? sectionMatch[1] : text;
  
  // Patterns pour les formations
  const patterns = [
    // Diplôme, Établissement, Année
    /([^,\n]{10,100}?)[,\s]+(?:[–-]\s*)?([^,\n]{5,80}?)[,\s]+(\d{4})/i,
    
    // Année : Diplôme, Établissement
    /(\d{4})\s*:?\s*([^,\n]{10,100}?)[,\s]+(?:[–-]\s*)?([^,\n]{5,80})/i,
    
    // Format avec mentions
    /(?:Bac|Master|Licence|Doctorat|BTS|DUT|DEUG|MBA|Ingénieur|CAP|BP)[^,\n]{5,100}?(?:[–-]\s*|\()([^,\n)]{5,80})/i
  ];
  
  // 1. Extraire avec les patterns principaux
  for (const pattern of patterns) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match: RegExpExecArray | null;
    
    while ((match = globalPattern.exec(textToAnalyze)) !== null) {
      // ✅ Vérification explicite que match n'est pas null
      if (!match) continue;
      
      try {
        let periode = '', diplome = '', etablissement = '';
        
        const patternStr = pattern.toString();
        
        if (patternStr.includes('(\\d{4})\\s*:')) {
          // Format: Année : Diplôme, Établissement
          periode = match[1] || '';
          diplome = match[2] || '';
          etablissement = match[3] || '';
        } else if (patternStr.includes('[^,\\n]{10,100}?')) {
          // Format: Diplôme, Établissement, Année
          diplome = match[1] || '';
          etablissement = match[2] || '';
          periode = match[3] || '';
        } else {
          // Format avec mentions
          diplome = match[0] || '';
          etablissement = match[1] || '';
        }
        
        if (diplome && diplome.length > 5) {
          // ✅ Vérifier les doublons avant d'ajouter
          const exists = formations.some(f => 
            f.diplome.toLowerCase().includes(diplome.toLowerCase().substring(0, 20))
          );
          
          if (!exists) {
            formations.push({
              periode: periode.trim(),
              diplome: diplome.trim(),
              etablissement: etablissement.trim()
            });
          }
        }
      } catch (e) {
        console.warn('Erreur parsing formation:', e);
        continue;
      }
    }
  }
  
  // 2. Recherche spécifique pour les diplômes
  const diplomeKeywords = ['Bac', 'Master', 'Licence', 'Doctorat', 'PhD', 'BTS', 'DUT', 'MBA', 'Ingénieur'];
  
  for (const keyword of diplomeKeywords) {
    const regex = new RegExp(`${keyword}[^\\n.]{5,100}`, 'gi');
    let match: RegExpExecArray | null;
    
    while ((match = regex.exec(textToAnalyze)) !== null) {
      // ✅ Vérification explicite que match n'est pas null
      if (!match) continue;
      
      try {
        // Chercher un établissement à proximité
        const contextStart = Math.max(0, (match.index || 0) - 30);
        const contextEnd = Math.min(textToAnalyze.length, (match.index || 0) + 100);
        const context = textToAnalyze.substring(contextStart, contextEnd);
        
        const etablissementMatch = context.match(/(?:[Uu]niversité|École|Institut|Lycée|Campus)[^,\n]{5,50}/);
        
        // ✅ Vérifier les doublons avec le diplome complet
        const diplomeText = match[0].trim();
        const exists = formations.some(f => 
          f.diplome.toLowerCase().includes(diplomeText.toLowerCase().substring(0, 20))
        );
        
        if (!exists && diplomeText.length > 5) {
          formations.push({
            periode: '',
            diplome: diplomeText,
            etablissement: etablissementMatch ? etablissementMatch[0].trim() : ''
          });
        }
      } catch (e) {
        console.warn('Erreur parsing diplome:', e);
        continue;
      }
    }
  }
  
  // 3. Dédupliquer avec typage explicite
  const formationMap = new Map<string, Formation>();
  
  formations.forEach((formation: Formation) => {
    const key = `${formation.diplome}|${formation.etablissement}`;
    if (!formationMap.has(key)) {
      formationMap.set(key, formation);
    }
  });
  
  const uniqueFormations = Array.from(formationMap.values());
  
  console.log(`✅ ${uniqueFormations.length} formations trouvées`);
  return uniqueFormations.slice(0, 10);
}

// ==================== EXTRACTION LANGUES ====================

// EXTRACTION LANGUES - Version corrigée
export async function extractLanguages(text: string): Promise<Langue[]> {
  console.log('🌐 Recherche des langues...');
  
  const langues: Langue[] = [];
  const lowerText = text.toLowerCase();
  
  const languesConnues = [
    'français', 'anglais', 'english', 'espagnol', 'allemand', 'italien', 
    'portugais', 'chinois', 'japonais', 'russe', 'arabe'
  ];
  
  const niveaux = ['courant', 'bilingue', 'natif', 'maternel', 'avancé', 'intermédiaire', 'débutant', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  
  // Chercher section langues
  const sectionMatch = text.match(/(?:langues?|linguistique)[\s:]*([^]*?)(?=\n\s*(?:compétences?|expériences?|formations?|$))/i);
  const textToAnalyze = sectionMatch ? sectionMatch[1] : text;
  
  for (const langue of languesConnues) {
    const langueRegex = new RegExp(`${langue}[^\\n]{0,50}`, 'gi');
    
    // ✅ Correction: utiliser RegExpExecArray au lieu de string[]
    let match: RegExpExecArray | null;
    
    while ((match = langueRegex.exec(textToAnalyze)) !== null) {
      // ✅ Vérification explicite que match n'est pas null
      if (!match) continue;
      
      try {
        const matchText = match[0];
        
        const niveau = niveaux.find(n => 
          matchText.toLowerCase().includes(n.toLowerCase())
        );
        
        // ✅ Nettoyer la langue extraite
        let langueText = match[0].split(/[,;\n]/)[0].trim();
        
        // ✅ Enlever les caractères indésirables
        langueText = langueText.replace(/[:\-–—]$/, '').trim();
        
        // ✅ Éviter les doublons
        const exists = langues.some(l => 
          l.langue.toLowerCase().includes(langueText.toLowerCase().substring(0, 8))
        );
        
        if (!exists && langueText.length > 2) {
          langues.push({
            langue: langueText,
            niveau: niveau || 'Non spécifié'
          });
        }
      } catch (e) {
        console.warn(`⚠️ Erreur parsing langue ${langue}:`, e);
        continue;
      }
    }
  }
  
  // ✅ Dédupliquer avec Map typé
  const languesMap = new Map<string, Langue>();
  
  langues.forEach((langue: Langue) => {
    const key = langue.langue.toLowerCase();
    if (!languesMap.has(key)) {
      languesMap.set(key, langue);
    }
  });
  
  const uniqueLangues = Array.from(languesMap.values());
  
  console.log(`✅ ${uniqueLangues.length} langues trouvées`);
  return uniqueLangues;
}

// ==================== EXTRACTION PROFIL ====================

export async function extractProfil(text: string): Promise<string | undefined> {
  console.log('📝 Recherche du profil/résumé...');
  
  const patterns = [
    /(?:profil|résumé|à propos|summary|about)[\s:]*([^]{50,500}?)(?=\n\s*(?:expériences?|formations?|compétences?|$))/i,
    /(?:je suis|fort de|avec plus de|fort d'expérience)[^.]{30,300}\./i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const profil = match[1] || match[0];
      // Nettoyer
      return profil.replace(/\n+/g, ' ').trim();
    }
  }
  
  return undefined;
}

// ==================== FONCTIONS EXISTANTES À CONSERVER ====================

export async function extractEmail(text: string): Promise<string> {
  const emailMatch = text.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  return emailMatch ? emailMatch[0] : '';
}

export async function extractPhone(text: string): Promise<string> {
  // Patterns français et internationaux
  const patterns = [
    /(?:\+33|0)[1-9](?:[\s\.-]?\d{2}){4}/,
    /(?:\(0\))?[1-9](?:[\s\.-]?\d{2}){4}/,
    /\+\d{2,3}\s*\d[\s\.-]?\d{2}[\s\.-]?\d{2}[\s\.-]?\d{2}[\s\.-]?\d{2}/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  
  return '';
}

export async function extractNameFromText(text: string): Promise<{ nom: string, prenom: string }> {
  // Prendre les 20 premières lignes
  const lines = text.split('\n').slice(0, 20);
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.length > 60) continue;
    
    // Pattern 1: "Jean-François BOISGONTIER" (prénom + NOM en majuscules)
    const pattern1 = trimmedLine.match(/^([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+(?:\s+[A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+)*)\s+([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ\-]{2,})$/);
    if (pattern1) {
      return { prenom: pattern1[1], nom: pattern1[2] };
    }
    
    // Pattern 2: "BOISGONTIER Jean-François" (NOM + prénom)
    const pattern2 = trimmedLine.match(/^([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ\-]{2,})\s+([A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+(?:\s+[A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜÇ][a-zéèêëàâäîïôöùûüç\-]+)*)$/);
    if (pattern2) {
      return { nom: pattern2[1], prenom: pattern2[2] };
    }
  }
  
  // Fallback: utiliser NLP
  try {
    const doc = nlp(text);
    const people = doc.people().out('array');
    if (people.length > 0) {
      const parts = people[0].split(' ');
      if (parts.length >= 2) {
        return {
          prenom: parts.slice(0, -1).join(' '),
          nom: parts[parts.length - 1]
        };
      }
    }
  } catch (e) {
    // Ignorer les erreurs NLP
  }
  
  return { nom: '', prenom: '' };
}

export async function extractSkills(text: string): Promise<string[]> {
  const skills = new Set<string>();
  const lowerText = text.toLowerCase();
  
  // Compétences techniques
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
  
  // Section compétences
  const skillsSection = text.match(/(?:compétences?|savoir-faire|expertise)[\s:]*([^]*?)(?=\n\s*(?:expériences?|formations?|langues?|$))/i);
  if (skillsSection && skillsSection[1]) {
    const skillsText = skillsSection[1];
    const lines = skillsText.split(/[\n•\-|,;]/);
    
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine && cleanLine.length > 1 && cleanLine.length < 50 && !cleanLine.includes('@')) {
        // Capitaliser
        skills.add(cleanLine.charAt(0).toUpperCase() + cleanLine.slice(1).toLowerCase());
      }
    }
  }
  
  return Array.from(skills).slice(0, 30);
}

export async function extractMetiers(text: string): Promise<string[]> {
  const metiers = new Set<string>();
  const lowerText = text.toLowerCase();
  
  const commonJobs = [
    'développeur', 'ingénieur', 'architecte', 'consultant', 'manager',
    'analyste', 'administrateur', 'technicien', 'chef de projet',
    'product owner', 'scrum master', 'devops', 'data scientist',
    'data analyst', 'ux designer', 'ui designer', 'testeur',
    'lead dev', 'cto', 'directeur technique'
  ];
  
  for (const metier of commonJobs) {
    if (lowerText.includes(metier)) {
      metiers.add(metier.charAt(0).toUpperCase() + metier.slice(1));
    }
  }
  
  return Array.from(metiers);
}

export async function extractCurrentPosition(text: string): Promise<string> {
  // Chercher dans les 30 premières lignes
  const lines = text.split('\n').slice(0, 30);
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    const positionPatterns = [
      /^([A-Z][a-zéèêëàâäîïôöùûüç]+(?:\s+[A-Z][a-zéèêëàâäîïôöùûüç]+){1,4})\s*(?:chez|@|at|-)/i,
      /(Chef\s+de\s+projet|Développeur|Ingénieur|Architecte|Consultant|Manager|Analyste|Designer|DevOps)/i
    ];
    
    for (const pattern of positionPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
  }
  
  return '';
}

export function extractCurrentCompany(text: string, experiences: Experience[]): string {
  // D'abord, chercher dans la dernière expérience
  if (experiences.length > 0) {
    // Trier par période si possible
    const sorted = [...experiences].sort((a, b) => {
      const yearA = parseInt(a.periode.match(/\d{4}/)?.[0] || '0');
      const yearB = parseInt(b.periode.match(/\d{4}/)?.[0] || '0');
      return yearB - yearA;
    });
    
    if (sorted[0].entreprise) {
      return sorted[0].entreprise;
    }
  }
  
  // Fallback: regex dans le texte
  const match = text.match(/(?:chez|@|at)\s*([A-Z][A-Za-z0-9\s\-&]{2,40})/i);
  return match ? match[1] : '';
}

export function calculateConfidenceScore(candidat: CandidatData): number {
  let score = 0;
  let maxScore = 0;
  
  // Informations personnelles (40%)
  if (candidat.nom && candidat.prenom) score += 20;
  else if (candidat.nom || candidat.prenom) score += 10;
  maxScore += 20;
  
  if (candidat.email) score += 15;
  maxScore += 15;
  
  if (candidat.telephone) score += 5;
  maxScore += 5;
  
  // Expériences (25%)
  const expScore = Math.min(candidat.experiences?.length || 0, 5) * 5;
  score += expScore;
  maxScore += 25;
  
  // Formations (20%)
  const formationScore = Math.min(candidat.formations?.length || 0, 4) * 5;
  score += formationScore;
  maxScore += 20;
  
  // Compétences (15%)
  const skillsScore = Math.min(candidat.competences?.length || 0, 15);
  score += skillsScore;
  maxScore += 15;
  
  // Adresse (5%)
  if (candidat.adresse) score += 5;
  maxScore += 5;
  
  return Math.round((score / maxScore) * 100) / 100;
}

export default parseCV;