// utils/extractCVData.ts
import type { Candidat, Experience, Formation, Langue } from "../types/candidats";

// ========================
// TYPES
// ========================
type ParsedLists = {
  postes: string[];
  profils: string[];
  competences: string[];
  experiences: Experience[];
  formations: Formation[];
  metiers: string[];
  langues: Langue[];
};

// ========================
// CONSTANTES
// ========================
const NIVEAUX_ORDER = ["CAP", "BEP", "BAC", "BAC+2", "BAC+3", "BAC+5", "Doctorat"];

// ========================
// FONCTIONS PRINCIPALES
// ========================

/**
 * Fonction principale d'extraction des données CV
 */
export async function extractCVData(buffer: Buffer, filename: string, supabase: any): Promise<Candidat> {
  try {
    console.log(`🔍 Début extraction CV: ${filename}`);
    
    const rawText = await readText(buffer, filename);
    const cleanText = normalizeText(rawText);

    console.log("===== TEXTE NETTOYÉ =====");
    console.log(cleanText.slice(0, 1500));
    console.log("==========================");

    // Extraction des informations de base
    const email = extractEmail(cleanText);
    const telephone = extractTelephone(cleanText);
    const linkedin = extractLinkedIn(cleanText);
    const liens = extractLiens(cleanText);
    const { nom, prenom } = guessName(cleanText, filename);
    const adresse = guessAddress(cleanText);

    console.log("📋 Informations extraites:", { nom, prenom, email, telephone });

    // Extraction des listes structurées
    const lists = parseStructuredLists(cleanText);
    
    // Chargement des dictionnaires
    const competencesDict = await loadDictionarySafe(supabase, "competences.json");
    const metiersDict = await loadDictionarySafe(supabase, "metiers.json");
    const formationsDict = await loadDictionarySafe(supabase, "formations.json");
    const postesDict = await loadDictionarySafe(supabase, "postes.json");
    const profilsDict = await loadDictionarySafe(supabase, "profils.json");

    // Normalisation avec les dictionnaires
    const competences = await normalizeWithDictionary(
      cleanArray(lists.competences),
      competencesDict,
      supabase,
      "competences.json"
    );

    const metiers = await normalizeWithDictionary(
      cleanArray(lists.metiers),
      metiersDict,
      supabase,
      "metiers.json"
    );

    const postes = await normalizeWithDictionary(
      cleanArray(lists.experiences.map(e => e.poste).filter((p): p is string => !!p)),
      postesDict,
      supabase,
      "postes.json"
    );

    const profils = await normalizeWithDictionary(
      cleanArray(lists.profils),
      profilsDict,
      supabase,
      "profils.json"
    );

    // Extraction du niveau
    const niveau = extractNiveauFromFormations(lists.formations);

    // Construction de l'objet candidat
    const candidat: Candidat = {
      fichier: filename,
      nom,
      prenom,
      email,
      telephone,
      adresse,
      linkedin,
      competences: competences.slice(0, 20), // Limiter à 20 compétences
      metiers: metiers.slice(0, 5), // Limiter à 5 métiers
      formations: lists.formations.slice(0, 10), // Limiter à 10 formations
      experiences: lists.experiences.slice(0, 10), // Limiter à 10 expériences
      langues: lists.langues.slice(0, 5), // Limiter à 5 langues
      postes: postes.slice(0, 5), // Limiter à 5 postes
      profil: profils.length > 0 ? profils[0] : null,
      entreprise: extractEntreprisePrincipale(lists.experiences),
      niveau
    };

    console.log("✅ Extraction terminée:", {
      nom: candidat.nom,
      prenom: candidat.prenom,
      niveau: candidat.niveau,
      metiers: candidat.metiers.length,
      competences: candidat.competences.length
    });

    return candidat;

  } catch (error) {
    console.error(`❌ Erreur lors de l'extraction de ${filename}:`, error);
    
    // Retourner un candidat minimal en cas d'erreur
    return createCandidatVide(filename);
  }
}

// ========================
// FONCTIONS D'EXTRACTION DE BASE
// ========================

function extractEmail(text: string): string | null {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

function extractTelephone(text: string): string | null {
  const phoneRegex = /(\+33|0)[1-9](\d{2}){4}/g;
  const match = text.match(phoneRegex);
  return match ? match[0] : null;
}

function extractLinkedIn(text: string): string | null {
  const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/[^\s]+/gi;
  const match = text.match(linkedinRegex);
  return match ? match[0] : null;
}

function extractLiens(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s)]+/gi;
  const matches = text.match(urlRegex) || [];
  return Array.from(new Set(matches)).filter(url => !url.includes('linkedin'));
}

function guessName(raw: string, filename: string): { nom: string | null; prenom: string | null } {
  // Essayer d'extraire du texte
  const lines = raw.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.match(/^(email|tél|téléphone|adresse)/i));

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    const words = line.split(/\s+/).filter(w => w.length > 1);
    
    if (words.length >= 2 && words.length <= 4) {
      // Vérifier si c'est une ligne de nom (pas un titre de section)
      if (!line.match(/compétences|expériences|formations|langues/i)) {
        if (isMostlyUpper(words[0])) {
          return { nom: words[0], prenom: words.slice(1).join(' ') };
        } else {
          return { prenom: words[0], nom: words.slice(1).join(' ') };
        }
      }
    }
  }

  // Fallback: utiliser le nom du fichier
  const baseName = filename.replace(/\.[^.]+$/, '');
  const parts = baseName.split(/[_\-\s]+/).filter(p => p.length > 1);
  
  if (parts.length >= 2) {
    if (isMostlyUpper(parts[0])) {
      return { nom: parts[0], prenom: parts.slice(1).join(' ') };
    } else {
      return { prenom: parts[0], nom: parts.slice(1).join(' ') };
    }
  }

  return { nom: null, prenom: null };
}

function isMostlyUpper(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (letters.length === 0) return false;
  const uppers = letters.replace(/[a-zà-öø-ÿ]/g, '');
  return uppers.length / letters.length > 0.5;
}

function guessAddress(text: string): string | null {
  const zipCodeRegex = /\b(0[1-9]|[1-8][0-9]|9[0-8])\d{3}\b/;
  const match = text.match(zipCodeRegex);
  return match ? match[0] : null;
}

function extractEntreprisePrincipale(experiences: Experience[]): string | null {
  if (experiences.length === 0) return null;
  
  // Prendre l'entreprise de la première expérience récente
  return experiences[0].entreprise || null;
}

// ========================
// EXTRACTION DU NIVEAU
// ========================

function extractNiveauFromFormations(formations: Formation[]): string | null {
  const niveaux: string[] = [];

  formations.forEach(formation => {
    const niveau = mapDiplomeToNiveau(formation.intitule);
    if (niveau) {
      niveaux.push(niveau);
    }
  });

  if (niveaux.length === 0) return null;

  return pickHighestLevel(niveaux);
}

function mapDiplomeToNiveau(diplome: string | null): string | null {
  if (!diplome) return null;
  const d = diplome.toLowerCase();

  if (/cap|certificat d'aptitude professionnelle/i.test(d)) return "CAP";
  if (/bep|brevet d'études professionnelles/i.test(d)) return "BEP";
  if (/\bbac\b|baccalauréat/i.test(d)) return "BAC";
  if (/bac\+2|bts|dut|deug/i.test(d)) return "BAC+2";
  if (/bac\+3|licence|bachelor/i.test(d)) return "BAC+3";
  if (/bac\+5|master|ingénieur/i.test(d)) return "BAC+5";
  if (/doctorat|phd|bac\+8/i.test(d)) return "Doctorat";

  return null;
}

function pickHighestLevel(niveaux: string[]): string | null {
  if (niveaux.length === 0) return null;

  let highest = niveaux[0];
  for (const niveau of niveaux) {
    const currentIndex = NIVEAUX_ORDER.indexOf(niveau);
    const highestIndex = NIVEAUX_ORDER.indexOf(highest);
    if (currentIndex > highestIndex) {
      highest = niveau;
    }
  }

  return highest;
}

// ========================
// LECTURE ET NETTOYAGE DU TEXTE
// ========================

async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  
  try {
    if (lower.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    
    if (lower.endsWith('.docx')) {
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    }
    
    if (lower.endsWith('.doc')) {
      throw new Error('Format .doc non supporté. Veuillez convertir en .docx ou .pdf.');
    }
    
    // Format texte
    return buffer.toString('utf8');
    
  } catch (error) {
    console.error(`Erreur lecture ${filename}:`, error);
    return buffer.toString('utf8'); // Fallback
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, '') // Supprimer caractères nuls
    .replace(/\r/g, '\n') // Normaliser les sauts de ligne
    .replace(/[ \t]+\n/g, '\n') // Supprimer espaces en fin de ligne
    .replace(/\n{3,}/g, '\n\n') // Réduire les multiples sauts de ligne
    .replace(/[�\uFFFD]/g, '') // Supprimer caractères de remplacement
    .replace(/\uf0b7/g, '•') // Remplacer caractère spécial par puce
    .normalize('NFKD') // Normalisation Unicode
    .replace(/[\u0300-\u036f]/g, '') // Supprimer diacritiques combinés
    .trim();
}

function cleanArray(items: (string | null)[]): string[] {
  return items
    .filter((item): item is string => !!item && item.length > 0)
    .map(item => item
      .replace(/[�\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\uf0b7/g, '•')
      .trim()
    )
    .filter(item => item.length > 1 && !/^[0-9\s\.\-]+$/.test(item));
}

// ========================
// EXTRACTION DES SECTIONS STRUCTURÉES
// ========================

function parseStructuredLists(raw: string): ParsedLists {
  const competences = extractCompetencesSection(raw);
  const experiences = extractExperiencesSection(raw);
  const formations = extractFormationsSection(raw);
  const langues = extractLanguesSection(raw);
  const metiers = extractMetiersSection(raw);
  const profils = extractProfilsSection(raw);
  const postes = extractPostesSection(raw);

  return {
    competences,
    experiences,
    formations,
    langues,
    metiers,
    profils,
    postes
  };
}

function extractCompetencesSection(raw: string): string[] {
  const section = extractSection(
    raw,
    /(compétences|skills|savoirs-faires?|qualifications)/i,
    /(expériences|formations|langues|centres d'intérêt)/i
  );
  return toList(section).slice(0, 30);
}

function extractExperiencesSection(raw: string): Experience[] {
  const section = extractSection(
    raw,
    /(expériences?|experience|parcours professionnel)/i,
    /(formations?|compétences|langues)/i
  );
  return toExperiences(section).slice(0, 15);
}

function extractFormationsSection(raw: string): Formation[] {
  const section = extractSection(
    raw,
    /(formations?|éducation|diplômes?)/i,
    /(expériences?|compétences|langues)/i
  );
  return toFormations(section).slice(0, 10);
}

function extractLanguesSection(raw: string): Langue[] {
  const section = extractSection(
    raw,
    /(langues?|languages?)/i,
    /(compétences|formations|centres d'intérêt)/i
  );
  return toLangues(section).slice(0, 5);
}

function extractMetiersSection(raw: string): string[] {
  const section = extractSection(
    raw,
    /(métier|poste|profession|emploi)/i,
    /(compétences|expériences|formations)/i
  );
  return toList(section).slice(0, 5);
}

function extractProfilsSection(raw: string): string[] {
  const section = extractSection(
    raw,
    /(profil|profile|présentation)/i,
    /(expériences|compétences|formations)/i
  );
  return toList(section).slice(0, 3);
}

function extractPostesSection(raw: string): string[] {
  // Les postes sont généralement extraits des expériences
  return [];
}

function extractSection(text: string, startRe: RegExp, endRe?: RegExp): string {
  const startMatch = startRe.exec(text);
  if (!startMatch) return '';

  const startIdx = startMatch.index + startMatch[0].length;
  let rest = text.slice(startIdx);

  if (endRe) {
    const endMatch = endRe.exec(rest);
    if (endMatch) {
      rest = rest.slice(0, endMatch.index);
    }
  }

  return rest.trim();
}

function toList(section: string): string[] {
  if (!section) return [];
  
  return section
    .split(/\n|•|●|▪|–|-|—/)
    .map(item => item.replace(/^[•●▪–—\s-]+/, '').trim())
    .filter(item => item.length > 2)
    .filter(item => !/^[0-9\.\-\s]+$/.test(item));
}

function toExperiences(section: string): Experience[] {
  if (!section) return [];

  const blocks = section.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const experiences: Experience[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    
    // Recherche de dates
    const dateMatch = firstLine.match(/(\d{4})\s*[-–]\s*(\d{4}|présent|aujourd'hui)/i);
    
    let poste = firstLine;
    let entreprise = null;
    let debut = null;
    let fin = null;

    if (dateMatch) {
      debut = dateMatch[1];
      fin = dateMatch[2];
      // Extraire le poste après les dates
      poste = firstLine.replace(dateMatch[0], '').trim();
    }

    // Recherche entreprise dans les lignes suivantes
    if (lines.length > 1) {
      const entrepriseLine = lines[1];
      if (entrepriseLine && !entrepriseLine.match(/(\d{4}|présent)/)) {
        entreprise = entrepriseLine;
      }
    }

    experiences.push({
      poste: poste || null,
      entreprise,
      debut,
      fin,
      description: block
    });
  }

  return experiences;
}

function toFormations(section: string): Formation[] {
  if (!section) return [];

  const blocks = section.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const formations: Formation[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const intitule = lines[0].replace(/^[•\-*]\s*/, '');
    const ecole = lines.length > 1 ? lines[1] : null;

    const formation: Formation = {
      intitule: intitule || null,
      ecole: ecole || null,
      diplome: intitule || null, // Ajouter la propriété diplome
      raw: block
    };
    
    formations.push(formation);
  }

  return formations;
}

function toLangues(section: string): Langue[] {
  const items = toList(section);
  return items.map(item => {
    const match = item.match(/^(.+?)(?:\s*[-\—]\s*(.+))?$/);
    return {
      langue: match?.[1]?.trim() || item,
      niveau: match?.[2]?.trim() || ''
    };
  });
}

// ========================
// GESTION DES DICTIONNAIRES
// ========================

async function loadDictionarySafe(supabase: any, path: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.storage
      .from('dictionaries')
      .download(`dictionaries/${path}`);

    if (error || !data) {
      console.warn(`Dictionnaire ${path} non trouvé, utilisation liste vide`);
      return [];
    }

    const text = await data.text();
    return JSON.parse(text);
  } catch (error) {
    console.error(`Erreur chargement dictionnaire ${path}:`, error);
    return [];
  }
}

async function normalizeWithDictionary(
  extractedItems: string[],
  dictionary: string[],
  supabase: any,
  dictPath: string
): Promise<string[]> {
  const newItems: string[] = [];
  const normalizedItems: string[] = [];

  for (const item of extractedItems) {
    const normalizedItem = item.trim().toLowerCase();
    const exists = dictionary.some(
      dictItem => dictItem.trim().toLowerCase() === normalizedItem
    );

    if (exists) {
      normalizedItems.push(item);
    } else {
      newItems.push(item);
      normalizedItems.push(item);
    }
  }

  // Mettre à jour le dictionnaire si nouvelles entrées
  if (newItems.length > 0) {
    await updateDictionary(supabase, dictPath, newItems);
  }

  return normalizedItems;
}

async function updateDictionary(supabase: any, path: string, newEntries: string[]): Promise<void> {
  try {
    const currentDict = await loadDictionarySafe(supabase, path);
    const updatedDict = [...new Set([...currentDict, ...newEntries])];

    const { error } = await supabase.storage
      .from('truthtalent')
      .upload(
        `dictionaries/${path}`,
        new Blob([JSON.stringify(updatedDict, null, 2)], { type: 'application/json' }),
        { upsert: true }
      );

    if (error) {
      console.error(`Erreur mise à jour dictionnaire ${path}:`, error.message);
    }
  } catch (error) {
    console.error(`Erreur mise à jour dictionnaire ${path}:`, error);
  }
}

// ========================
// FONCTION UTILITAIRE
// ========================

function createCandidatVide(filename: string): Candidat {
  return {
    fichier: filename,
    nom: null,
    prenom: null,
    email: null,
    telephone: null,
    adresse: null,
    linkedin: null,
    competences: [],
    metiers: [],
    formations: [],
    experiences: [],
    langues: [],
    postes: [],
    profil: null,
    entreprise: null,
    niveau: null
  };
}