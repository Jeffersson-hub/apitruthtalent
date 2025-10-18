// services/documentParser.ts
import { Candidat, Experience, Formation, Langue } from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

// ========================
// TYPES
// ========================
interface NameResult {
  nom: string | null;
  prenom: string | null;
}

type DomaineMetier = 
  | 'informatique' 
  | 'industrie_btp' 
  | 'commerce_marketing' 
  | 'sante_bien_etre' 
  | 'education_culture' 
  | 'logistique_services';

interface DictionnaireMetier {
  domaine: DomaineMetier;
  metiers: string[];
}

// ========================
// CONFIGURATION
// ========================
const DOMAINES_CONFIG: Record<DomaineMetier, { fichier: string; motsCles: string[] }> = {
  informatique: {
    fichier: "metiers_informatique.json",
    motsCles: ['informatique', 'développeur', 'programmeur', 'software', 'IT', 'réseau', 'système', 'base de données', 'cybersécurité']
  },
  industrie_btp: {
    fichier: "metiers_industrie_btp.json", 
    motsCles: ['industrie', 'btp', 'construction', 'manufacturier', 'production', 'ouvrier', 'technicien', 'chantier']
  },
  commerce_marketing: {
    fichier: "metiers_commerce_marketing.json",
    motsCles: ['commerce', 'marketing', 'vente', 'commercial', 'client', 'account', 'business', 'market']
  },
  sante_bien_etre: {
    fichier: "metiers_sante_bien_etre.json",
    motsCles: ['santé', 'médical', 'infirmier', 'médecin', 'soin', 'bien-être', 'esthétique', 'paramédical']
  },
  education_culture: {
    fichier: "metiers_education_culture.json", 
    motsCles: ['éducation', 'enseignement', 'professeur', 'culture', 'art', 'musique', 'formation', 'pédagogie']
  },
  logistique_services: {
    fichier: "metiers_logistique_services.json",
    motsCles: ['logistique', 'transport', 'supply chain', 'service', 'maintenance', 'entretien', 'logistique']
  }
};

const NIVEAUX_ORDER = ["CAP", "BEP", "BAC", "BAC+2", "BAC+3", "BAC+5", "Doctorat"];

// ========================
// REGEX
// ========================
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const phoneRegex = /(\+33|0)[1-9](\d{2}){4}/g;
const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/[^\s]+/gi;

// ========================
// FONCTIONS PRINCIPALES
// ========================

export async function extractCVData(buffer: Buffer, filename: string, supabase: any): Promise<Candidat> {
  try {
    console.log(`🔍 Début extraction CV: ${filename}`);
    
    const rawText = await readText(buffer, filename);
    const cleanText = normalizeText(rawText);

    console.log("📋 Extraction des informations de base...");

    // Extraction des informations de base
    const email = extractEmail(cleanText);
    const telephone = extractTelephone(cleanText);
    const linkedin = extractLinkedIn(cleanText);
    const { nom, prenom } = guessName(cleanText, filename);
    const adresse = guessAddress(cleanText);

    console.log("📋 Informations extraites:", { nom, prenom, email, telephone });

    // Extraction des sections structurées
    const experiences = extractExperiences(cleanText);
    const formations = extractFormations(cleanText);
    const competences = extractCompetences(cleanText);
    
    // Extraction des métiers avec système par domaines
    const metiers = await extractMetiersWithDomains(cleanText, supabase);

    
    const postes = extractPostesFromExperiences(experiences);
    const entreprise = extractEntreprisePrincipale(experiences);
    const niveau = extractNiveauFromFormations(formations);

    // Construction de l'objet candidat
    const candidat: Candidat = {
      fichier: filename,
      nom,
      prenom,
      email,
      telephone,
      adresse,
      linkedin,
      competences: competences.slice(0, 20),
      metiers: metiers.slice(0, 5),
      formations: formations.slice(0, 10),
      experiences: experiences.slice(0, 10),
      langues: [], // À implémenter si nécessaire
      postes: postes.slice(0, 5),
      profil: null, // À implémenter si nécessaire
      entreprise,
      niveau
    };

    console.log("✅ Extraction terminée:", {
      nom: candidat.nom,
      prenom: candidat.prenom,
      niveau: candidat.niveau,
      metiers: candidat.metiers,
      competences: candidat.competences.length
    });

    return candidat;

  } catch (error) {
    console.error(`❌ Erreur lors de l'extraction de ${filename}:`, error);
    return createCandidatVide(filename);
  }
}

// ========================
// EXTRACTION MÉTIERS AVEC DOMAINES
// ========================

async function extractMetiersWithDomains(rawText: string, supabase: any): Promise<string[]> {
   console.log("🔍 Début extraction métiers avec domaines");
  const metiers: Set<string> = new Set();
  
  const cleanedText = normalizeText(rawText);
  const dictionnaires = await loadAllDomainDictionaries(supabase);
  const domainesPertinents = detectDomaines(cleanedText, dictionnaires);
  
  console.log(`🎯 Domaines détectés: ${domainesPertinents.map(d => d.domaine).join(', ')}`);
  
  for (const domaine of domainesPertinents) {
    const metiersDomaine = await extractMetiersFromDomaine(cleanedText, domaine, supabase);
    metiersDomaine.forEach(metier => metiers.add(metier));
  }
  
  if (metiers.size === 0) {
    const metiersFallback = await extractMetiersFallback(cleanedText, supabase);
    metiersFallback.forEach(metier => metiers.add(metier));
  }
  
  return Array.from(metiers).slice(0, 5);
}

async function loadAllDomainDictionaries(supabase: any): Promise<DictionnaireMetier[]> {
  const dictionnaires: DictionnaireMetier[] = [];
  
  for (const [domaine, config] of Object.entries(DOMAINES_CONFIG)) {
    try {
      const metiers = await loadDictionarySafe(supabase, config.fichier);
      dictionnaires.push({
        domaine: domaine as DomaineMetier,
        metiers
      });
    } catch (error) {
      console.warn(`⚠️ Dictionnaire ${config.fichier} non chargé`);
    }
  }
  
  return dictionnaires;
}

function detectDomaines(text: string, dictionnaires: DictionnaireMetier[]): DictionnaireMetier[] {
  const scores: Map<DomaineMetier, number> = new Map();
  
  Object.keys(DOMAINES_CONFIG).forEach(domaine => {
    scores.set(domaine as DomaineMetier, 0);
  });
  
  for (const [domaine, config] of Object.entries(DOMAINES_CONFIG)) {
    let score = 0;
    
    config.motsCles.forEach(motCle => {
      const regex = new RegExp(`\\b${escapeRegex(motCle)}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) score += matches.length * 2;
    });
    
    const dictDomaine = dictionnaires.find(d => d.domaine === domaine);
    if (dictDomaine) {
      dictDomaine.metiers.forEach(metier => {
        const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
        if (regex.test(text)) score += 3;
      });
    }
    
    scores.set(domaine as DomaineMetier, score);
  }
  
  return Array.from(scores.entries())
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([domaine]) => dictionnaires.find(d => d.domaine === domaine)!)
    .slice(0, 3);
}

async function extractMetiersFromDomaine(text: string, domaine: DictionnaireMetier, supabase: any): Promise<string[]> {
  const metiersTrouves: string[] = [];
  
  // Recherche exacte dans le dictionnaire
  for (const metier of domaine.metiers) {
    const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
    if (regex.test(text)) {
      metiersTrouves.push(metier);
    }
  }
  
  // Extraction des postes des expériences
  const experiences = extractExperiences(text);
  for (const exp of experiences) {
    if (exp.poste) {
      const metierNormalise = await findMetierInDictionaries(exp.poste, [domaine]);
      if (metierNormalise && !metiersTrouves.includes(metierNormalise)) {
        metiersTrouves.push(metierNormalise);
      }
    }
  }
  
  return metiersTrouves.slice(0, 3);
}

async function extractMetiersFallback(text: string, supabase: any): Promise<string[]> {
  const metiers: Set<string> = new Set();
  const allDictionnaires = await loadAllDomainDictionaries(supabase);
  const allMetiers = allDictionnaires.flatMap(d => d.metiers);
  
  // Recherche directe
  for (const metier of allMetiers) {
    const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
    if (regex.test(text)) metiers.add(metier);
  }
  
  // Extraction des expériences
  const experiences = extractExperiences(text);
  for (const exp of experiences) {
    if (exp.poste) {
      const cleanPoste = cleanMetierItem(exp.poste);
      if (cleanPoste) {
        const similarMetier = findSimilarMetier(cleanPoste, allMetiers);
        if (similarMetier) {
          metiers.add(similarMetier);
        } else {
          metiers.add(cleanPoste);
        }
      }
    }
  }
  
  return Array.from(metiers).slice(0, 3);
}

// ========================
// FONCTIONS UTILITAIRES MÉTIERS
// ========================

async function findMetierInDictionaries(terme: string, dictionnaires: DictionnaireMetier[]): Promise<string | null> {
  const termeNormalise = normalizeForMatching(terme);
  const allMetiers = dictionnaires.flatMap(d => d.metiers);
  
  for (const metier of allMetiers) {
    if (normalizeForMatching(metier) === termeNormalise) return metier;
  }
  
  for (const metier of allMetiers) {
    const similarity = calculateSimilarity(termeNormalise, normalizeForMatching(metier));
    if (similarity > 0.8) return metier;
  }
  
  return null;
}

function findSimilarMetier(terme: string, metiersList: string[]): string | null {
  const termeNormalise = normalizeForMatching(terme);
  
  for (const metier of metiersList) {
    const metierNormalise = normalizeForMatching(metier);
    const similarity = calculateSimilarity(termeNormalise, metierNormalise);
    if (similarity > 0.7) return metier;
  }
  
  return null;
}

function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  const wordsA = a.split(' ');
  const wordsB = b.split(' ');
  const commonWords = wordsA.filter(word => wordsB.includes(word));
  return commonWords.length / Math.max(wordsA.length, wordsB.length);
}

function cleanMetierItem(item: string): string | null {
  let clean = item
    .replace(/\([^)]*\)/g, '')
    .replace(/\d{4}/g, '')
    .replace(/(cdi|cdd|stage|alternance|apprentissage|contrat|temps|plein|partiel)/gi, '')
    .replace(/[^a-zA-ZÀ-ÿ0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (clean.length < 2 || clean.length > 50) return null;
  if (clean.split(' ').length > 4) return null;
  if (/^(19|20)\d{2}$/.test(clean)) return null;
  
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================
// FONCTIONS D'EXTRACTION DE BASE (EXISTANTES)
// ========================

function extractEmail(text: string): string | null {
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

function extractTelephone(text: string): string | null {
  const match = text.match(phoneRegex);
  return match ? match[0] : null;
}

function extractLinkedIn(text: string): string | null {
  const match = text.match(linkedinRegex);
  return match ? match[0] : null;
}

function guessName(raw: string, filename: string): { nom: string | null; prenom: string | null } {
  const lines = raw.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.match(/^(email|tél|téléphone|adresse)/i));

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    const words = line.split(/\s+/).filter(w => w.length > 1);
    
    if (words.length >= 2 && words.length <= 4) {
      if (!line.match(/compétences|expériences|formations|langues/i)) {
        if (isMostlyUpper(words[0])) {
          return { nom: words[0], prenom: words.slice(1).join(' ') };
        } else {
          return { prenom: words[0], nom: words.slice(1).join(' ') };
        }
      }
    }
  }

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
  return experiences[0].entreprise || null;
}

// ========================
// EXTRACTION DES SECTIONS
// ========================

function extractExperiences(text: string): Experience[] {
  const experiencesSection = extractSection(
    text,
    /(expériences?|experience|parcours professionnel)/i,
    /(formations?|formation|éducation|compétences)/i
  );

  if (!experiencesSection) return [];

  const expRegex = /(\d{4})\s*[-–—]\s*(\d{4}|présent|aujourd'hui|actuel)(.*?)(?=\d{4}\s*[-–—]|$)/gis;
  const matches = Array.from(text.matchAll(expRegex));

  return matches.map(match => {
    const description = match[3] || '';
    const posteMatch = description.match(/^(.*?)(?= - | chez | à |$)/);
    
    return {
      debut: match[1] || null,
      fin: match[2] || null,
      poste: posteMatch ? posteMatch[1].trim() : null,
      entreprise: extractEntrepriseFromExperience(description),
      description: description.trim(),
    };
  }).filter(exp => exp.poste !== null);
}

function extractEntrepriseFromExperience(description: string): string | null {
  const entrepriseRegex = /(?: - | chez | à |entreprise |société )([A-Z][A-Za-z0-9&\-\s]{2,})/i;
  const match = description.match(entrepriseRegex);
  return match ? match[1].trim() : null;
}

function extractFormations(text: string): Formation[] {
  const formationsSection = extractSection(
    text,
    /(formations?|formation|éducation|diplômes?|diplome)/i,
    /(expériences?|experience|compétences|langues|centres d'intérêt)/i
  );

  if (!formationsSection) return [];

  const blocks = formationsSection.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const formations: Formation[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const intitule = lines[0].replace(/^[•\-*]\s*/, '').trim();
    const ecole = lines.length > 1 ? lines[1].trim() : null;

    if (intitule) {
      formations.push({
        intitule,
        ecole,
        diplome: intitule,
        raw: block
      });
    }
  }

  return formations.slice(0, 10);
}

function extractCompetences(text: string): string[] {
  const competencesSection = extractSection(
    text, 
    /(compétences|skills|savoirs-faires?|qualifications)/i,
    /(expériences|expérience|formations|formation|langues)/i
  );
  
  if (!competencesSection) {
    return extractCompetencesFromText(text);
  }

  return extractCompetencesFromSection(competencesSection);
}

function extractCompetencesFromSection(section: string): string[] {
  const cleanedText = section
    .replace(/[�■□▢▣▤▥▦▧▨▩▪▫▬▭▮▯▰▱▲△▴▵▶▷▸▹►▻▼▽▾▿◀◁◂◃◄◅◆◇◈◉◊○◌◍◎●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡◢◣◤◥◦◧◨◩◪◫◬◭◮◯]/g, '')
    .replace(/\uf0b7/g, '•')
    .normalize('NFKD');

  const competences = cleanedText
    .split(/\n|•|●|▪|–|-|—|\.\s+|;/)
    .map(s => s.replace(/^[•●▪–—\s\t-]+/, '').trim())
    .filter(s => s.length > 2 && 
                !/^[0-9\.]+$/.test(s) && 
                !/compétences?|skills?|savoirs-faires?/i.test(s))
    .slice(0, 15);

  return [...new Set(competences)];
}

function extractCompetencesFromText(text: string): string[] {
  const competencesCommunes = [
    'maçonnerie', 'ferraillage', 'tracés', 'lecture de plans', 'violon',
    'enseignement musical', 'organisation d\'événements', 'maquillage artistique',
    'maquillage de mariée', 'conseils en image', 'gestion de chantier', 'planification'
  ];

  const competencesTrouvees: string[] = [];
  const textLower = text.toLowerCase();

  competencesCommunes.forEach(competence => {
    if (textLower.includes(competence.toLowerCase())) {
      competencesTrouvees.push(competence);
    }
  });

  return competencesTrouvees.slice(0, 10);
}

function extractPostesFromExperiences(experiences: Experience[]): string[] {
  return experiences
    .map(exp => exp.poste)
    .filter((poste): poste is string => !!poste)
    .slice(0, 5);
}

// ========================
// EXTRACTION NIVEAU
// ========================

function extractNiveauFromFormations(formations: Formation[]): string | null {
  const niveaux: string[] = [];

  formations.forEach(formation => {
    const niveau = mapDiplomeToNiveau(formation.intitule);
    if (niveau) niveaux.push(niveau);
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
    if (currentIndex > highestIndex) highest = niveau;
  }
  return highest;
}

// ========================
// LECTURE ET NETTOYAGE
// ========================

async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  
  try {
    if (lower.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    
    if (lower.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    }
    
    return buffer.toString('utf8');
    
  } catch (error) {
    console.error(`Erreur lecture ${filename}:`, error);
    return buffer.toString('utf8');
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[�\uFFFD]/g, '')
    .replace(/\uf0b7/g, '•')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractSection(text: string, startRegex: RegExp, endRegex: RegExp): string {
  const startMatch = startRegex.exec(text);
  if (!startMatch) return '';

  let startIndex = startMatch.index + startMatch[0].length;
  let remainingText = text.slice(startIndex);

  const endMatch = endRegex.exec(remainingText);
  if (endMatch) {
    remainingText = remainingText.slice(0, endMatch.index);
  }

  return remainingText.trim();
}

// ========================
// GESTION DICTIONNAIRES
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