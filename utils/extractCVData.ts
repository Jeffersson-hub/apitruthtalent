// utils/extractCVData.ts
import { Candidat, Formation, Langue, Experience } from '../types/candidats';

/**
 * Nom et prénom
 * Supporte : "Jean Dupont" ou "DUPONT Jean"
 */
export function extractNomPrenom(text: string): { nom: string | null; prenom: string | null } {
  // Jean Dupont
  let match = text.match(/^([A-ZÉ][a-zéàè]+(?:[-\s][A-ZÉa-zéàè]+)?)\s+([A-Z][A-Za-zéàè]+)/m);
  if (match) return { prenom: match[1], nom: match[2] };

  // DUPONT Jean
  match = text.match(/^([A-ZÉ]{2,})\s+([A-ZÉ][a-zéàè]+)/m);
  if (match) return { nom: match[1], prenom: match[2] };

  return { nom: null, prenom: null };
}

/**
 * Téléphone français
 */
export function extractTelephone(text: string): string | null {
  const match = text.match(/(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/);
  return match ? match[0].replace(/\s/g, '') : null;
}

/**
 * Email
 */
export function extractEmail(text: string): string | null {
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match ? match[0] : null;
}

/**
 * Poste
 */
export function extractPoste(text: string): string | null {
  const match = text.match(/^([A-ZÉ][a-zéàè]+(?:[-\s][A-ZÉa-zéàè]+)?)\s+([A-Z][A-Za-zéàè]+)/m);
  return match ? match[0] : null;
}

/**
 * Profil
 */
export function extractProfil(text: string): string | null {
  const match = text.match(/^([A-ZÉ][a-zéàè]+(?:[-\s][A-ZÉa-zéàè]+)?)\s+([A-Z][A-Za-zéàè]+)/m);
  return match ? match[0] : null;
}

/**
 * entreprise
 */
export function extractEntreprise(text: string): string | null {
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match ? match[0] : null;
}

/**
 * LinkedIn
 */
export function extractLinkedIn(text: string): string | null {
  const match = text.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/i);
  return match ? `linkedin.com/in/${match[1]}` : null;
}

/**
 * Compétences
 */
export function extractCompetences(text: string): string[] {
  const match = text.match(/compétences?\s*[:\-]\s*([\s\S]*?)(?=\n\S+:|$)/i);
  if (!match) return [];
  return match[1].split(/,|;/).map(c => c.trim()).filter(c => c.length > 0);
}

/**
 * Expériences
 */
export function extractExperiences(text: string): Experience[] {
  const regex = /(?:expérience|poste|emploi|stage)\s*[:\-]?\s*([^\n]+)\s+(?:chez|@|-)\s*([^\n]+)\s*(?:\(([^)]+)\))?/gi;
  const experiences: Experience[] = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    experiences.push({
      poste: null,
      entreprise: m[2]?.trim() || null,
      periode: m[3]?.trim() || null,
      description: null,
      debut: '',
      fin: ''
    });
  }
  return experiences;
}

/**
 * Formations
 */
export function extractFormations(text: string): Formation[] {
  const regex = /(?:formation|dipl[oô]me|études?|licence|master|bac[+\s]?[0-9]*)\s*[:\-]?\s*([^\n]+)/gi;
  const formations: Formation[] = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    formations.push({ raw: m[1].trim() });
  }
  return formations;
}

/**
 * Langues
 */
export function extractLangues(text: string): Langue[] {
  const regex = /([A-ZÉ][a-zA-Zéàè]+(?:\s+[A-Z][a-z]+)*)\s*[:\-–]\s*([A-Za-z0-9\s-]+)/g;
  const langues: Langue[] = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    langues.push({ langue: m[1].trim(), niveau: m[2].trim() });
  }
  return langues;
}

/**
 * Texte depuis buffer
 */
export async function extractTextFromBuffer(fileBuffer: Buffer, fileName: string): Promise<string> {
  if (fileName.endsWith('.pdf')) {
    const pdf = (await import('pdf-parse')).default;
    const data = await pdf(fileBuffer);
    return data.text;
  } else if (fileName.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else {
    throw new Error('Format non supporté (PDF ou DOCX seulement)');
  }
}

/**
 * Extraction principale
 */
export async function extractCVData(fileBuffer: Buffer, fileName: string): Promise<Candidat> {
  const text = await extractTextFromBuffer(fileBuffer, fileName);
  const { nom, prenom } = extractNomPrenom(text);

  return {
    nom,
    prenom,
    email: extractEmail(text),
    entreprise: extractEntreprise(text),
    poste: extractPoste(text),
    profil: extractProfil(text),
    telephone: extractTelephone(text),
    adresse: null, // tu peux ajouter une regex pour l'adresse
    competences: extractCompetences(text),
    experiences: extractExperiences(text),
    linkedin: extractLinkedIn(text),
    formations: extractFormations(text),
    langues: extractLangues(text)
  };
}
