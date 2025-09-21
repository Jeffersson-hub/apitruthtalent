// services/documentParser.ts
import { Candidat, Experience, Formation } from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import competencesDict from "../dictionaries/competences.json";
import metiersDict from "../dictionaries/metiers.json";
import profilsDict from "../dictionaries/profils.json";

// ========================
// REGEX de base
// ========================
const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneRegex = /(\+?\d[\d\s().-]{7,})/g;
const urlRegex = /\bhttps?:\/\/[^\s)]+/gi;
const nameRegex = /\b([A-Z][a-zà-öø-ÿ]+)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ-]+)\b/;

// ========================
// HELPERS
// ========================
function splitName(fulltext: string): { nom: string | null; prenom: string | null } {
  const m = fulltext.match(nameRegex);
  if (!m) return { nom: null, prenom: null };
  return { prenom: m[1] || null, nom: m[2] || null };
}

function extractPoste(text: string): string[] {
  if (!Array.isArray(metiersDict)) return [];
  const posteRegex = new RegExp(`\\b(${metiersDict.join("|")})\\b`, "ig");
  const matches = text.match(posteRegex);
  return matches ? Array.from(new Set(matches.map(s => s.trim()))) : [];
}

function extractEntreprise(text: string, experiences: Experience[]): string | null {
  const entrepriseRegex = /\b(?:chez|à|pour)\s+([A-Z][A-Za-z0-9&\-\s]+)/i;
  const match = text.match(entrepriseRegex);
  if (match) return match[1].trim();

  if (experiences.length > 0) {
    return experiences.find(exp => exp.entreprise)?.entreprise ?? null;
  }

  return null;
}

function extractCompetences(text: string): string[] {
  const lower = text.toLowerCase();
  return (Array.isArray(competencesDict) ? competencesDict : [])
    .filter(skill => lower.includes(skill.toLowerCase()));
}

function extractMetiers(text: string): string[] {
  const lower = text.toLowerCase();
  return (Array.isArray(metiersDict) ? metiersDict : [])
    .filter(job => lower.includes(job.toLowerCase()));
}

function extractExperiences(text: string): Experience[] {
  const expRegex = /\b(\d{4})\s*[-–—]\s*(\d{4}|présent|aujourd'hui)\b(.*?)(?=\n\s*\d{4}\s*[-–—]|\n{2,}|$)/gis;
  const matches = Array.from(text.matchAll(expRegex));

  return matches.map(m => ({
    debut: m[1] ?? null,
    fin: m[2] ?? null,
    poste: (m[3] && extractPoste(m[3])[0]) ?? null,
    entreprise: extractEntreprise(m[3] ?? "", []),
    description: (m[3] ?? "").trim(),
  }));
}

// ========================
// CONVERSION DOCX / PDF
// ========================
async function docxToText(buffer: Buffer): Promise<string> {
  const res = await mammoth.extractRawText({ buffer });
  return res.value || "";
}

async function pdfToText(buffer: Buffer): Promise<string> {
  const res = await pdfParse(buffer);
  return res.text || "";
}

export async function extractTextFromBuffer(filename: string, buffer: Buffer): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "docx") return docxToText(buffer);
  if (ext === "pdf") return pdfToText(buffer);
  return buffer.toString("utf8");
}

// ------------------ Mapping diplômes -> niveau ------------------
function mapDiplomeToNiveau(diplome: string | null): string | null {
  if (!diplome) return null;
  const d = diplome.toLowerCase();

  if (/cap|certificat d'aptitude/.test(d)) return "CAP";
  if (/bep|brevet d'études professionnelles/.test(d)) return "BEP";
  if (/\bbac\b|baccalauréat/.test(d)) return "BAC";
  if (/bac\+2|bts|dut|deug/.test(d)) return "BAC+2";
  if (/licence|bachelor|bac\+3/.test(d)) return "BAC+3";
  if (/master|bac\+5|ingénieur/.test(d)) return "BAC+5";
  if (/doctorat|phd|bac\+8/.test(d)) return "Doctorat";

  return null;
}

function pickHighestLevel(niveaux: string[]): string | null {
  const order = ["CAP","BEP","BAC","BAC+2","BAC+3","BAC+5","Doctorat"];
  if (!niveaux.length) return null;
  return niveaux.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] ?? null;
}

// ========================
// EXTRACTION FORMATIONS + NIVEAU
// ========================
function extractFormations(text: string): Formation[] {
  const startRe = /(formation|formations|education|dipl[oô]mes?|diplome|certificat)/i;
  const stopRe = /(expériences?|experience|compétences?|skills?|langues?|languages?|centres|hobbies|certificat|certifications?)/i;

  const mStart = startRe.exec(text);
  if (!mStart) return [];

  const startIdx = mStart.index + mStart[0].length;
  let rest = text.slice(startIdx);

  const mStop = stopRe.exec(rest);
  if (mStop) rest = rest.slice(0, mStop.index);

  // Séparer en blocs (double saut de ligne). Si pas de double saut, chaque ligne possiblement contient une formation
  const blocks = rest.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  const out: Formation[] = blocks.flatMap(b => {
    // Un bloc peut contenir plusieurs lignes; chaque ligne commençant par une puce ou une majuscule peut être une formation
    const lines = b.split(/\n/).map(l => l.replace(/^[•●▪–—\s\t\uf0b7]+/, "").trim()).filter(Boolean);
    if (lines.length === 0) return [];
    // Si une seule ligne -> créer une formation
    if (lines.length === 1) {
      return [{
        intitule: lines[0] || null,
        raw: b
      }];
    }
    // 1ère ligne = intitule, 2ème ligne = école (si pertinente)
    return [{
      intitule: lines[0] || null,
      ecole: lines[1] || null,
      raw: b
    }];
  });

  return out.slice(0, 50);
}

function extractNiveau(text: string): string | null {
  // 1) Cherche dans la section "formations"
  const formations = extractFormations(text);
  const niveauxFromFormations = formations
    .map(f => mapDiplomeToNiveau(f.intitule ?? null))
    .filter((n): n is string => !!n);

  if (niveauxFromFormations.length) {
    return pickHighestLevel(niveauxFromFormations);
  }

  // 2) fallback : recherche dans tout le texte des mots-clés
  const fallbackMatch = text.match(/\b(CAP|BEP|BTS|DUT|Licence|Bachelor|Master|Doctorat|PhD|Baccalauréat|bac\+?\d?)/i);
  if (fallbackMatch) {
    return mapDiplomeToNiveau(fallbackMatch[0]) ?? null;
  }

  return null;
}

// ========================
// MAIN PARSER
// ========================
export async function parseCandidateFromBuffer(
  filename: string,
  buffer: Buffer,
  sourcePath?: string | null
): Promise<Candidat> {
  const text = await extractTextFromBuffer(filename, buffer);

  const email = (text.match(emailRegex) || [null])[0] ?? null;
  const phone = (text.match(phoneRegex) || [null])?.[0]?.replace(/\s+/g, " ").trim() ?? null;
  const { nom, prenom } = splitName(text);

  const experiences = extractExperiences(text);
  const postes = extractPoste(text);
  const entreprise = extractEntreprise(text, experiences);
  const competences = extractCompetences(text);
  const metiers = extractMetiers(text);
  const formations = extractFormations(text);
  const niveau = extractNiveau(text);

  const candidat: Candidat = {
    nom,
    prenom,
    //profil: (Array.isArray(profilsDict) && profilsDict[0]) ?? null,
    profil: null,
    email,
    telephone: phone,
    adresse: null,
    postes,
    entreprise: entreprise ?? null,
    competences,
    experiences,
    formations,
    langues: [],
    metiers,
    niveau,
  };

  return candidat;
}
