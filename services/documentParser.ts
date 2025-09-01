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
const nameRegex = /\b([A-Z][a-z]+)\s+([A-Z][a-z-]+)\b/;

// ========================
// HELPERS
// ========================
function splitName(fulltext: string): { nom: string | null; prenom: string | null } {
  const m = fulltext.match(nameRegex);
  if (!m) return { nom: null, prenom: null };
  return { prenom: m[1] || null, nom: m[2] || null };
}

function extractPoste(text: string): string | null {
  const posteRegex = new RegExp(
    `\\b(${metiersDict.join("|")})\\b`,
    "i"
  );
  const match = text.match(posteRegex);
  return match ? match[0] : null;
}

function extractEntreprise(text: string, experiences: Experience[]): string | null {
  // 1️⃣ Essayer "chez" / "à" / "pour"
  const entrepriseRegex = /\b(?:chez|à|pour)\s+([A-Z][A-Za-z0-9&\-\s]+)/;
  const match = text.match(entrepriseRegex);
  if (match) return match[1].trim();

  // 2️⃣ Sinon fallback sur expériences
  if (experiences.length > 0) {
    return experiences.find(exp => exp.entreprise)?.entreprise ?? null;
  }

  return null;
}

function extractCompetences(text: string): string[] {
  const lower = text.toLowerCase();
  return competencesDict.filter(skill => lower.includes(skill.toLowerCase()));
}

function extractMetiers(text: string): string[] {
  const lower = text.toLowerCase();
  return metiersDict.filter(job => lower.includes(job.toLowerCase()));
}

function extractExperiences(text: string): Experience[] {
  // Exemple simple basé sur YYYY - YYYY
  const expRegex = /\b(\d{4})\s*-\s*(\d{4}|présent|aujourd'hui)\b(.*?)(?=\d{4}|$)/gis;
  const matches = [...text.matchAll(expRegex)];

  return matches.map(m => ({
    debut: m[1],                  // alignement avec type Experience
    fin: m[2],
    poste: extractPoste(m[3]) ?? null,
    entreprise: extractEntreprise(m[3], []),
    description: m[3].trim(),
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

// ========================
// MAIN PARSER
// ========================
export async function parseCandidateFromBuffer(
  filename: string,
  buffer: Buffer,
  sourcePath?: string | null
): Promise<Candidat> {
  const text = await extractTextFromBuffer(filename, buffer);

  const email = (text.match(emailRegex) || [null])[0];
  const phone = (text.match(phoneRegex) || [null])?.[0]?.replace(/\s+/g, " ").trim() ?? null;
  //const links = Array.from(new Set(text.match(urlRegex) || []));
  const { nom, prenom } = splitName(text);

  const experiences = extractExperiences(text);
  const poste = extractPoste(text);
  const entreprise = extractEntreprise(text, experiences);
  const competences = extractCompetences(text);
  const metiers = extractMetiers(text);

  return {
    nom,
    prenom,
    profil: profilsDict[0] ?? null, // ✅ un seul profil (string) au lieu de profils[]
    email,
    telephone: phone,
    adresse: null,
    poste,
    entreprise: entreprise ?? null, // ✅ string au lieu de tableau
    competences,
    //experiences,
    formations: [] as Formation[],
    //langues: [],
    metiers,
  };
}