// services/documentParser.ts
import { Candidat, Experience } from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

// heuristiques simples
const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phoneRegex = /(\+?\d[\d\s().-]{7,})/g;
const urlRegex = /\bhttps?:\/\/[^\s)]+/gi;
const nameRegex = /\b([A-Z][a-z]+)\s+([A-Z][a-z-]+)\b/;

function splitName(fulltext: string): { nom: string | null; prenom: string | null } {
  const m = fulltext.match(nameRegex);
  if (!m) return { nom: null, prenom: null };
  // heuristique: prenom = premier, nom = second
  return { prenom: m[1] || null, nom: m[2] || null };
}

function extractProfil(text: string): string | null {
  const profilRegex = /\b(développeur|developer|engineer|ingénieur|designer|manager|consultant|analyst|data scientist|chef de projet|full stack|backend|frontend)\b/i;
  const match = text.match(profilRegex);
  return match ? match[0] : null;
}

function extractPoste(text: string): string | null {
  const posteRegex = /\b(développeur|developer|engineer|ingénieur|designer|manager|consultant|analyst|data scientist|chef de projet|full stack|backend|frontend)\b/i;
  const match = text.match(posteRegex);
  return match ? match[0] : null;
}

function extractEntreprise(text: string, experiences: Experience[]): string | null {
  // 1️⃣ Essayer de trouver après "chez" ou "à"
  const entrepriseRegex = /\b(?:chez|à|pour)\s+([A-Z][A-Za-z0-9&\-\s]+)/;
  const match = text.match(entrepriseRegex);
  if (match) {
    return match[1].trim();
  }

  // 2️⃣ Sinon, prendre la première entreprise détectée dans experiences
  if (experiences.length > 0 && experiences[0].entreprise) {
    return experiences[0].entreprise;
  }

  return null;
}


function extractCompetences(text: string): string[] {
  // Exemple de logique d'extraction de compétences
  const skillKeywords = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'SQL',
    'Machine Learning', 'AWS', 'Docker', 'Git', 'Linux', 'Tensorflow',
    'Agile', 'Scrum', 'UI/UX', 'Marketing', 'Sales'
  ];

  const foundSkills: string[] = [];

  skillKeywords.forEach(skill => {
    if (text.toLowerCase().includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  });

  return foundSkills;
}


function extractExperiences(text: string): Experience[] {
  // Heuristique minimaliste
  const lines = text.split(/\r?\n/).slice(0, 400);
  const exps: Experience[] = [];
  for (const line of lines) {
    if (/stage|développeur|engineer|ingénieur|chef de projet|lead|manager/i.test(line)) {
      exps.push({
          poste: line.trim(),
          entreprise: "",
          debut: "",
          fin: ""
      });
    }
  }
  return exps.slice(0, 8);
}

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
  // fallback: essayer en texte brut
  return buffer.toString("utf8");

}

export async function parseCandidateFromBuffer(filename: string, buffer: Buffer, sourcePath?: string | null): Promise<Candidat> {
  const text = await extractTextFromBuffer(filename, buffer);

  const email = (text.match(emailRegex) || [null])[0];
  const phone = (text.match(phoneRegex) || [null])?.[0]?.replace(/\s+/g, " ").trim() ?? null;
  const links = Array.from(new Set(text.match(urlRegex) || []));

  

  const { nom, prenom } = splitName(text);
  const competences = extractCompetences(text);
  const experiences = extractExperiences(text);
  const profil = extractProfil(text);
  const poste = extractPoste(text);
  const entreprise = extractEntreprise(text, experiences);
  

  return {
    nom,
    prenom,
    profil,
    email,
    entreprise,
    poste,
    telephone: phone,
    adresse: null,
    competences,
    experiences,
    formations: [], // Valeur par défaut
    langues: [],  
  };
}

