// services/documentParser.ts - VERSION CORRIGÉE
import type Candidat from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const METIERS_REFERENCE: Record<string, string[]> = {
  informatique: [
    'Développeur Fullstack', 'Développeur Frontend', 'Développeur Backend', 
    'Ingénieur DevOps', 'Administrateur Systèmes', 'Architecte Cloud',
    'Data Scientist', 'Data Analyst', 'Ingénieur Machine Learning'
  ],
  industrie: [
    'Technicien Industriel', 'Ingénieur Process', 'Chef de Chantier',
    'Conducteur de Travaux', 'Mécanicien Industriel'
  ],
  commerce: [
    'Commercial', 'Business Developer', 'Account Manager', 'Chargé de Clientèle'
  ]
};

export async function extractCVData(buffer: Buffer, filename: string, _supabase: any): Promise<Candidat> {
  try {
    console.log(`🔍 Extraction CV: ${filename}`);
    
    // 1. Lire le texte
    const text = await readText(buffer, filename);
    
    // 2. Extraire les données de base
    const email = extractEmail(text);
    const telephone = extractTelephone(text);
    const linkedin = extractLinkedIn(text);
    const { nom, prenom } = guessNameAmeliore(text, filename);
    const adresse = guessAddress(text);
    
    // 3. Extraire les données structurées
    const experiences = extractExperiencesAmeliorees(text);
    const formations = extractFormationsAmeliorees(text);
    const competences = extractCompetencesAmeliorees(text);
    const metiers = extractMetiersFromText(text);
    const niveau = extractNiveauFromFormationsAmeliore(formations);
    const langues = extractLanguesFromText(text);
    const postes = extractPostesFromExperiences(experiences);
    const profil = extractProfilFromText(text);
    const entreprise = extractEntreprisePrincipale(experiences);
    
    // 4. Calculer les années d'expérience
    const anneesExperience = calculateAnneesExperience(experiences);
    
    // 5. Construire le candidat (respecter l'interface Candidat)
    const candidat: Candidat = {
      fichier: filename,
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      poste: postes.length > 0 ? postes[0] : null,
      entreprise: entreprise || null,
      profil: profil || null,
      competences: Array.isArray(competences) ? competences.slice(0, 20) : [],
      metiers: Array.isArray(metiers) ? metiers.slice(0, 5) : [],
      formations: Array.isArray(formations) ? formations.slice(0, 10) : [],
      experiences: Array.isArray(experiences) ? experiences.slice(0, 10) : [],
      langues: Array.isArray(langues) ? langues : [],
      adresse: adresse || null,
      linkedin: linkedin || null,
      niveau: niveau || null,

      // Nom du fichier uploadé / stocké
      cv_filename: filename,

      // Propriétés optionnelles
      annees_experience: anneesExperience, // ← Ajouté ici
      postes: postes.slice(0, 5),
      source_analyse: 'document_parser'
    };
    
    console.log("✅ Extraction terminée:", {
      nom: candidat.nom,
      prenom: candidat.prenom,
      poste: candidat.poste,
      niveau: candidat.niveau,
      annees_experience: candidat.annees_experience
    });
    
    return candidat;
    
  } catch (error) {
    console.error(`❌ Erreur extraction ${filename}:`, error);
    return createCandidatVide(filename);
  }
}

// Fonction pour calculer les années d'expérience
function calculateAnneesExperience(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;
  
  // Logique simple : nombre d'expériences * 1.5 (approximation)
  return Math.round(experiences.length * 1.5);
}

function createCandidatVide(filename: string): Candidat {
  return {
    fichier: filename,
    nom: null,
    prenom: null,
    email: null,
    telephone: null,
    poste: null,
    entreprise: null,
    profil: null,
    competences: [],
    metiers: [],
    formations: [],
    experiences: [],
    langues: [],
    adresse: null,
    linkedin: null,
    niveau: null,
    cv_filename: filename,
    source_analyse: 'erreur'
    // annees_experience est optionnel, pas besoin de l'inclure ici
  };
}

function extractEmail(_text: string): string | null {
  const match = _text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi);
  return match ? match[0] : null;
}

function extractTelephone(_text: string): string | null {
  const match = _text.match(/(\+33|0)[1-9](\d{2}){4}/g);
  return match ? match[0] : null;
}

function extractLinkedIn(_text: string): string | null {
  const match = _text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/gi);
  return match ? match[0] : null;
}

function guessAddress(_text: string): string | null {
  const zipCodeRegex = /\b(0[1-9]|[1-8][0-9]|9[0-8])\d{3}\b/;
  const match = _text.match(zipCodeRegex);
  return match ? match[0] : null;
}

function guessNameAmeliore(_raw: string, _filename: string): { nom: string | null; prenom: string | null } {
  const lines = _raw.split('\n').slice(0, 5);
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 5 && trimmed.length < 50) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        return {
          prenom: parts[0],
          nom: parts.slice(1).join(' ')
        };
      }
    }
  }
  
  const baseName = _filename.replace(/\.[^.]+$/, '');
  const parts = baseName.split(/[_\-\s]+/);
  if (parts.length >= 2) {
    return {
      prenom: parts[0],
      nom: parts.slice(1).join(' ')
    };
  }
  
  return { nom: null, prenom: null };
}

function extractExperiencesAmeliorees(_text: string): any[] {
  const experiences: any[] = [];
  const lines = _text.split('\n');
  
  let currentExperience: any = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.match(/\b(19|20)\d{2}\b.*\b(19|20)\d{2}\b/) || trimmed.match(/Expérience|expérience/)) {
      if (currentExperience) {
        experiences.push(currentExperience);
      }
      
      currentExperience = {
        debut: null,
        fin: null,
        poste: null,
        entreprise: null,
        description: trimmed
      };
    }
    
    if (currentExperience) {
      if (!currentExperience.poste && trimmed.length > 5 && trimmed.length < 100) {
        currentExperience.poste = trimmed;
      }
    }
  }
  
  if (currentExperience) {
    experiences.push(currentExperience);
  }
  
  return experiences.slice(0, 5);
}

function extractFormationsAmeliorees(_text: string): any[] {
  const formations: any[] = [];
  const lines = _text.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.match(/(master|licence|bts|bac|ingénieur|diplôme|formation)/i) && trimmed.length > 10) {
      formations.push({
        intitule: trimmed,
        ecole: null,
        diplome: trimmed,
        raw: trimmed
      });
    }
  }
  
  return formations.slice(0, 5);
}

function extractCompetencesAmeliorees(_text: string): string[] {
  const competences: string[] = [];
  const skills = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java',
    'SQL', 'MongoDB', 'Docker', 'AWS', 'Git', 'HTML', 'CSS', 'PHP'
  ];
  
  for (const skill of skills) {
    if (_text.includes(skill)) {
      competences.push(skill);
    }
  }
  
  return competences;
}

function extractMetiersFromText(_text: string): string[] {
  const metiers: string[] = [];
  const textLower = _text.toLowerCase();
  
  for (const [, metiersList] of Object.entries(METIERS_REFERENCE)) {
    for (const metier of metiersList) {
      if (textLower.includes(metier.toLowerCase())) {
        metiers.push(metier);
      }
    }
  }
  
  return metiers.slice(0, 3);
}

function extractNiveauFromFormationsAmeliore(_formations: any[]): string | null {
  for (const formation of _formations) {
    const text = formation.intitule?.toLowerCase() || formation.raw?.toLowerCase() || '';
    
    if (text.includes('doctorat') || text.includes('phd')) return 'Doctorat';
    if (text.includes('master') || text.includes('mastère')) return 'BAC+5';
    if (text.includes('licence') || text.includes('bachelor')) return 'BAC+3';
    if (text.includes('bts') || text.includes('dut')) return 'BAC+2';
    if (text.includes('bac')) return 'BAC';
    if (text.includes('cap') || text.includes('bep')) return 'CAP/BEP';
  }
  
  return null;
}

function extractLanguesFromText(_text: string): any[] {
  const langues: any[] = [];
  const textLower = _text.toLowerCase();
  
  if (textLower.includes('anglais')) {
    langues.push({ langue: 'Anglais', niveau: 'Intermédiaire' });
  }
  
  if (textLower.includes('français')) {
    langues.push({ langue: 'Français', niveau: 'Natif' });
  }
  
  if (textLower.includes('espagnol')) {
    langues.push({ langue: 'Espagnol', niveau: 'Débutant' });
  }
  
  return langues;
}

function extractPostesFromExperiences(_experiences: any[]): string[] {
  const postes: string[] = [];
  
  for (const exp of _experiences) {
    if (exp.poste && !postes.includes(exp.poste)) {
      postes.push(exp.poste);
    }
  }
  
  return postes.slice(0, 5);
}

function extractProfilFromText(_text: string): string | null {
  const textLower = _text.toLowerCase();
  
  if (textLower.includes('développeur')) return 'Développeur';
  if (textLower.includes('ingénieur')) return 'Ingénieur';
  if (textLower.includes('technicien')) return 'Technicien';
  if (textLower.includes('commercial')) return 'Commercial';
  
  return null;
}

function extractEntreprisePrincipale(_experiences: any[]): string | null {
  if (!_experiences || _experiences.length === 0) return null;
  return _experiences[0].entreprise || null;
}

// Nettoyage du texte
function cleanExtractedText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/\x00/g, '') // Supprimer les caractères nuls
    .replace(/\\u0000/g, '') // Supprimer les séquences Unicode nulles
    .replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, ' ') // Garder les caractères imprimables
    .replace(/\s+/g, ' ') // Normaliser les espaces
    .trim();
}

// Lecture et nettoyage du texte depuis Buffer
async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  
  try {
    let text = '';
    
    if (lower.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      text = data.text || '';
    } else if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
      const { value } = await mammoth.extractRawText({ buffer });
      text = value || '';
    } else {
      text = buffer.toString('utf8');
    }
    
    // Nettoyer le texte extrait
    return cleanExtractedText(text);
    
  } catch (error) {
    console.error(`Erreur lecture ${filename}:`, error);
    return cleanExtractedText(buffer.toString('utf8'));
  }
}