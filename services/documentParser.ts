// services/documentParser.ts
import { Candidat, Experience, Formation } from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

// ========================
// TYPES
// ========================
interface NameResult {
  nom: string | null;
  prenom: string | null;
}

// ========================
// REGEX
// ========================
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const phoneRegex = /(\+33|0)[1-9](\d{2}){4}/g;

// ========================
// HELPERS
// ========================
function splitName(fulltext: string): NameResult {
  const lines = fulltext.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return { nom: null, prenom: null };
  }

  const firstLine = lines[0];
  const words = firstLine.split(/\s+/).filter(word => word.length > 1);
  
  if (words.length >= 2) {
    if (isMostlyUpper(words[0])) {
      return { nom: words[0], prenom: words.slice(1).join(' ') };
    } else {
      return { prenom: words[0], nom: words.slice(1).join(' ') };
    }
  }
  
  return { nom: null, prenom: null };
}

function isMostlyUpper(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (letters.length === 0) return false;
  const uppers = letters.replace(/[a-zà-öø-ÿ]/g, "");
  return uppers.length / letters.length > 0.6;
}

function extractPoste(text: string): string[] {
  const postesCommuns = [
    'chef de chantier', 'maçon', 'manœuvre', 'professeur', 'violoniste', 
    'musicien', 'maquilleuse', 'esthéticienne', 'assistante'
  ];
  
  const postesTrouves: string[] = [];
  const textLower = text.toLowerCase();
  
  postesCommuns.forEach(poste => {
    if (textLower.includes(poste.toLowerCase())) {
      postesTrouves.push(poste);
    }
  });
  
  return postesTrouves;
}

function extractEntreprise(text: string, experiences: Experience[]): string | null {
  const entrepriseRegex = /(?:chez|à|pour|entreprise|société)[\s:]+([A-Z][A-Za-z0-9&\-\s]{3,})/i;
  const match = text.match(entrepriseRegex);
  if (match) return match[1].trim();

  if (experiences.length > 0) {
    for (const exp of experiences) {
      if (exp.entreprise) return exp.entreprise;
    }
  }

  return null;
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
// EXTRACTION COMPÉTENCES
// ========================
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

// ========================
// EXTRACTION MÉTIERS
// ========================
function extractMetiers(text: string): string[] {
  const metiers: string[] = [];
  
  const experiences = extractExperiences(text);
  experiences.forEach(exp => {
    if (exp.poste && !metiers.includes(exp.poste)) {
      metiers.push(exp.poste);
    }
  });

  const metierPatterns = [
    /(?:poste|métier|profession|emploi)[\s:]*([^\n\.]+)/i,
    /(?:recherche|recherché)[\s:]*([^\n\.]+)/i,
    /(?:profil|profil recherché)[\s:]*([^\n\.]+)/i,
    /(?:actuellement|currently)[\s:]*([^\n\.]+)/i
  ];

  metierPatterns.forEach(pattern => {
    const match = text.match(pattern);
    if (match && match[1]) {
      const metier = match[1].trim();
      if (metier && metier.length > 2 && !metiers.includes(metier)) {
        metiers.push(metier);
      }
    }
  });

  return metiers.slice(0, 3);
}

// ========================
// EXTRACTION EXPÉRIENCES (CORRIGÉE)
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
    
    const experience: Experience = {
      debut: match[1] || null,
      fin: match[2] || null,
      poste: posteMatch ? posteMatch[1].trim() : null,
      entreprise: extractEntrepriseFromExperience(description),
      description: description.trim(),
    };
    
    return experience;
  }).filter(exp => exp.poste !== null);
}

function extractEntrepriseFromExperience(description: string): string | null {
  const entrepriseRegex = /(?: - | chez | à |entreprise |société )([A-Z][A-Za-z0-9&\-\s]{2,})/i;
  const match = description.match(entrepriseRegex);
  return match ? match[1].trim() : null;
}

// ========================
// EXTRACTION FORMATIONS (CORRIGÉE)
// ========================
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
      const formation: Formation = {
        intitule,
        ecole,
        diplome: intitule, // Utiliser intitule comme diplome par défaut
        raw: block
      };
      formations.push(formation);
    }
  }

  return formations.slice(0, 10);
}

// ========================
// EXTRACTION NIVEAU
// ========================
function extractNiveau(text: string): string | null {
  const niveauDirect = extractNiveauFromText(text);
  if (niveauDirect) return niveauDirect;

  const niveauFromFormations = extractNiveauFromFormations(text);
  if (niveauFromFormations) return niveauFromFormations;

  return null;
}

function extractNiveauFromText(text: string): string | null {
  const niveauRegex = /\b(CAP|BEP|BAC|BAC\+2|BTS|DUT|BAC\+3|Licence|Bachelor|BAC\+5|Master|Ingénieur|Doctorat|PhD)\b/gi;
  const matches = text.match(niveauRegex);
  
  if (!matches || matches.length === 0) return null;

  const niveaux = matches.map(m => m.toUpperCase().replace(/\s+/g, ''));
  return pickHighestLevel(niveaux);
}

function extractNiveauFromFormations(text: string): string | null {
  const formations = extractFormations(text);
  const niveaux: string[] = [];

  const niveauPatterns = {
    'CAP': /cap|certificat d'aptitude professionnelle/i,
    'BEP': /bep|brevet d'études professionnelles/i,
    'BAC': /\bbac\b|baccalauréat/i,
    'BAC+2': /bac\+2|bts|dut|deug/i,
    'BAC+3': /bac\+3|licence|bachelor/i,
    'BAC+5': /bac\+5|master|ingénieur/i,
    'Doctorat': /doctorat|phd|bac\+8/i
  };

  formations.forEach(formation => {
    const intitule = formation.intitule || '';
    for (const [niveau, pattern] of Object.entries(niveauPatterns)) {
      if (pattern.test(intitule)) {
        niveaux.push(niveau);
      }
    }
  });

  if (niveaux.length > 0) {
    return pickHighestLevel(niveaux);
  }

  return null;
}

function pickHighestLevel(niveaux: string[]): string | null {
  const order = ["CAP", "BEP", "BAC", "BAC+2", "BAC+3", "BAC+5", "Doctorat"];
  if (niveaux.length === 0) return null;
  
  let highest = niveaux[0];
  for (const niveau of niveaux) {
    const currentIndex = order.indexOf(niveau);
    const highestIndex = order.indexOf(highest);
    if (currentIndex > highestIndex) {
      highest = niveau;
    }
  }
  
  return highest;
}

// ========================
// CONVERSION DOCX/PDF
// ========================
async function docxToText(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (error) {
    console.error("Erreur conversion DOCX:", error);
    return "";
  }
}

async function pdfToText(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    console.error("Erreur conversion PDF:", error);
    return "";
  }
}

export async function extractTextFromBuffer(filename: string, buffer: Buffer): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();
  
  try {
    if (ext === 'docx') {
      return await docxToText(buffer);
    } else if (ext === 'pdf') {
      return await pdfToText(buffer);
    } else {
      return buffer.toString('utf8');
    }
  } catch (error) {
    console.error(`Erreur extraction texte depuis ${filename}:`, error);
    return buffer.toString('utf8');
  }
}

// ========================
// FONCTION PRINCIPALE (CORRIGÉE)
// ========================
export async function parseCandidateFromBuffer(
  filename: string,
  buffer: Buffer,
  sourcePath?: string | null
): Promise<Candidat> {
  try {
    const rawText = await extractTextFromBuffer(filename, buffer);
    
    const cleanText = rawText
      .replace(/[^\x00-\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const emailMatch = cleanText.match(emailRegex);
    const email = emailMatch ? emailMatch[0] : null;

    const phoneMatch = cleanText.match(phoneRegex);
    const phone = phoneMatch ? phoneMatch[0] : null;

    const { nom, prenom } = splitName(cleanText);
    const experiences = extractExperiences(cleanText);
    const postes = extractPoste(cleanText);
    const entreprise = extractEntreprise(cleanText, experiences);
    const competences = extractCompetences(cleanText);
    const metiers = extractMetiers(cleanText);
    const formations = extractFormations(cleanText);
    const niveau = extractNiveau(cleanText);

    const candidat: Candidat = {
      nom: nom || null,
      prenom: prenom || null,
      profil: null,
      email: email || null,
      telephone: phone || null,
      adresse: null,
      postes: postes.length > 0 ? postes : [],
      entreprise: entreprise || null,
      competences: competences.length > 0 ? competences : [],
      experiences: experiences.length > 0 ? experiences : [],
      formations: formations.length > 0 ? formations : [],
      langues: [],
      metiers: metiers.length > 0 ? metiers : [],
      niveau: niveau || null,
    };

    console.log(`✅ Candidat parsé: ${prenom} ${nom} - Niveau: ${niveau}`);
    return candidat;

  } catch (error) {
    console.error(`❌ Erreur parsing ${filename}:`, error);
    
    return {
      nom: null,
      prenom: null,
      profil: null,
      email: null,
      telephone: null,
      adresse: null,
      postes: [],
      entreprise: null,
      competences: [],
      experiences: [],
      formations: [],
      langues: [],
      metiers: [],
      niveau: null,
    };
  }
}