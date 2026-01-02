import type Candidat from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { callNerService } from "../utils/nerClient";
import fs from "fs";
import path from "path";
import Fuse from "fuse.js";
import * as chrono from "chrono-node";

/* --- Dictionnaires (si présents) --- */
function loadJsonList(relPath: string): string[] {
  try {
    const p = path.join(process.cwd(), relPath);
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (error: any) {
    console.warn("⚠️ Erreur lecture dictionnaire", relPath, error?.message ?? String(error));
    return [];
  }
}
const SKILL_LIST = loadJsonList("dictionaries/skills.json");
const TITLE_LIST = loadJsonList("dictionaries/titles.json");

const skillFuse = new Fuse(SKILL_LIST, { includeScore: true, threshold: 0.35, ignoreLocation: true });
const titleFuse = new Fuse(TITLE_LIST, { includeScore: true, threshold: 0.35, ignoreLocation: true });

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-.,\/]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueKeepOrder<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/* --- Nettoyage / lecture texte --- */
function cleanExtractedText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\x00/g, "")
    .replace(/\\u0000/g, "")
    .replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    let text = "";
    if (lower.endsWith(".pdf")) {
      const data = await pdfParse(buffer);
      text = data.text || "";
    } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
      const { value } = await mammoth.extractRawText({ buffer });
      text = value || "";
    } else {
      text = buffer.toString("utf8");
    }
    return cleanExtractedText(text);
  } catch (error: any) {
    console.warn("Erreur readText:", error?.message ?? String(error));
    return cleanExtractedText(buffer.toString("utf8"));
  }
}

/* --- Extracteurs simples --- */
function extractEmail(_text: string): string | null {
  const match = _text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi);
  return match ? match[0] : null;
}
function extractTelephone(_text: string): string | null {
  const match = _text.match(/(\+33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}|\+?\d{7,15}/g);
  return match ? match[0] : null;
}
function extractLinkedIn(_text: string): string | null {
  const match = _text.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/gi);
  return match ? match[0] : null;
}
function guessAddress(_text: string): string | null {
  const match = _text.match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

/* --- Compétences (ngrams + fuzzy) --- */
function generateNGrams(tokens: string[], maxN = 4): string[] {
  const ngrams: string[] = [];
  const len = tokens.length;
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i <= len - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return ngrams;
}
function extractCompetencesAmeliorees(_text: string): string[] {
  const text = normalize(_text);
  if (!text) return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  const ngrams = generateNGrams(tokens, 4);
  const matches: string[] = [];
  for (const ng of ngrams) {
    const res = skillFuse.search(ng, { limit: 1 });
    if (res && res.length > 0 && (res[0] as any).score <= 0.35) matches.push((res[0] as any).item);
  }
  for (const s of SKILL_LIST) {
    if (text.includes(s.toLowerCase())) matches.push(s);
  }
  return uniqueKeepOrder(matches).slice(0, 40);
}

/* --- Métiers (fuzzy + header) --- */
function extractMetiersFromText(_text: string): string[] {
  const text = normalize(_text);
  if (!text) return [];
  const candidates: string[] = [];
  const tokens = text.split(/\s+/).slice(0, 500);
  const ngrams = generateNGrams(tokens, 3);
  for (const ng of ngrams) {
    const res = titleFuse.search(ng, { limit: 1 });
    if (res && res.length > 0 && (res[0] as any).score <= 0.35) candidates.push((res[0] as any).item);
  }
  const firstLines = _text.split("\n").slice(0, 8).join(" ");
  for (const t of TITLE_LIST) {
    if (normalize(firstLines).includes(t.toLowerCase())) candidates.push(t);
  }
  return uniqueKeepOrder(candidates).slice(0, 5);
}

/* --- Experiences basiques (chrono + heuristics) --- */
type Experience = { debut: string | null; fin: string | null; poste: string | null; entreprise: string | null; description?: string | null; };

function parseDateRangeFromLine(line: string): { debut: string | null; fin: string | null } | null {
  const results = chrono.parse(line);
  if (results && results.length > 0) {
    const first = results[0];
    const start = first.start ? first.start.date().toISOString() : null;
    const end = first.end ? first.end.date().toISOString() : null;
    if (start || end) return { debut: start, fin: end };
  }
  const match = line.match(/(19|20)\d{2}[^0-9]{0,6}((19|20)\d{2}|aujourd'hui|present|en cours)/i);
  if (match) {
    const years = line.match(/\b(19|20)\d{2}\b/g);
    const debut = years && years[0] ? `${years[0]}-01-01T00:00:00.000Z` : null;
    const fin = years && years[1] ? `${years[1]}-12-31T00:00:00.000Z` : (/(aujourd'hui|present|en cours)/i.test(line) ? new Date().toISOString() : null);
    return { debut, fin };
  }
  return null;
}

function extractExperiencesAmeliorees(_text: string): Experience[] {
  if (!_text) return [];
  const lines = _text.split("\n").map(l => l.trim()).filter(Boolean);
  const experiences: Experience[] = [];
  let current: Experience | null = null;
  let bufferDesc: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateRange = parseDateRangeFromLine(line);
    const isPossibleHeader = /expérience(s)?|experience|missions|poste(s)?/i.test(line);
    const hasYear = /\b(19|20)\d{2}\b/.test(line);
    if (dateRange || isPossibleHeader || hasYear) {
      if (current) {
        current.description = bufferDesc.join(" ").trim() || null;
        experiences.push(current);
        bufferDesc = [];
      }
      const prev = lines[i - 1] || "";
      const next = lines[i + 1] || "";
      let poste: string | null = null;
      let entreprise: string | null = null;
      if (prev && prev.length > 2 && prev.length < 80 && !/\b(19|20)\d{2}\b/.test(prev)) poste = prev;
      if (next && /société|entreprise|sa|sas|inc|llc|groupe|company|company/i.test(next)) entreprise = next;
      else if (next && next.length > 2 && next.length < 80 && !/\b(19|20)\d{2}\b/.test(next)) {
        if (!poste) poste = next;
        else entreprise = next;
      }
      current = { debut: dateRange ? dateRange.debut : null, fin: dateRange ? dateRange.fin : null, poste, entreprise, description: null };
      continue;
    }
    if (current) bufferDesc.push(line);
  }
  if (current) {
    current.description = bufferDesc.join(" ").trim() || null;
    experiences.push(current);
  }
  if (experiences.length === 0 && lines.length > 0) {
    experiences.push({ debut: null, fin: null, poste: lines.slice(0, 1).join(" "), entreprise: lines.slice(1, 2).join(" "), description: lines.slice(2, 8).join(" ") });
  }
  return experiences.slice(0, 20).map(exp => ({ debut: exp.debut, fin: exp.fin, poste: exp.poste || null, entreprise: exp.entreprise || null, description: exp.description || null }));
}

/* --- Autres utilitaires --- */
function extractFormationsAmeliorees(_text: string): any[] {
  const formations: any[] = [];
  const lines = _text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/(master|licence|bts|bac|ingénieur|dipl[oô]me|formation)/i.test(trimmed) && trimmed.length > 10) formations.push({ intitule: trimmed, ecole: null, raw: trimmed });
  }
  return formations.slice(0, 5);
}

function extractNiveauFromFormationsAmeliore(_formations: any[]): string | null {
  if (!Array.isArray(_formations) || _formations.length === 0) return null;
  for (const formation of _formations) {
    const text = (formation.intitule || formation.raw || "").toString().toLowerCase();
    if (!text) continue;
    if (text.includes('doctorat') || text.includes('phd')) return 'Doctorat';
    if (text.includes('master') || text.includes('mastère')) return 'BAC+5';
    if (text.includes('licence') || text.includes('bachelor')) return 'BAC+3';
    if (text.includes('bts') || text.includes('dut')) return 'BAC+2';
    if (text.includes('bac') && !text.includes('bac+')) return 'BAC';
    if (text.includes('cap') || text.includes('bep')) return 'CAP/BEP';
  }
  return null;
}

function extractLanguesFromText(_text: string): any[] {
  const langues: any[] = []; const t = _text?.toLowerCase() || "";
  if (t.includes("anglais")) langues.push({ langue: "Anglais", niveau: "Intermédiaire" });
  if (t.includes("français")) langues.push({ langue: "Français", niveau: "Natif" });
  if (t.includes("espagnol")) langues.push({ langue: "Espagnol", niveau: "Débutant" });
  return langues;
}
function extractPostesFromExperiences(_experiences: any[]): string[] {
  const postes: string[] = [];
  for (const exp of _experiences) if (exp.poste && !postes.includes(exp.poste)) postes.push(exp.poste);
  return postes.slice(0, 5);
}
function extractProfilFromText(_text: string): string | null {
  const t = (_text || "").toLowerCase();
  if (t.includes("développeur")) return "Développeur";
  if (t.includes("ingénieur")) return "Ingénieur";
  if (t.includes("technicien")) return "Technicien";
  if (t.includes("commercial")) return "Commercial";
  return null;
}
function extractEntreprisePrincipale(_experiences: any[]): string | null {
  if (!_experiences || _experiences.length === 0) return null; return _experiences[0].entreprise || null;
}

function calculateAnneesExperience(experiences: any[]): number {
  if (!Array.isArray(experiences) || experiences.length === 0) return 0;
  let totalYears = 0;
  for (const exp of experiences) {
    try {
      const start = exp.debut ? new Date(exp.debut) : null;
      const end = exp.fin ? new Date(exp.fin) : new Date();
      if (start && !isNaN(start.getTime()) && end && !isNaN(end.getTime()) && end >= start) {
        totalYears += (end.getFullYear() - start.getFullYear()) + ((end.getMonth() - start.getMonth()) / 12);
      }
    } catch (error: any) { /* ignore */ }
  }
  return Math.round(totalYears * 10) / 10;
}

/* --- Export principal : extractCVData --- */
export async function extractCVData(buffer: Buffer, filename: string, _supabase: any): Promise<Candidat> {
  try {
    const text = await readText(buffer, filename);

    // Initialisation des variables (déclarées avec let pour permettre overwrite par NER)
    let nom: string | null = null;
    let prenom: string | null = null;
    let email: string | null = extractEmail(text);
    let telephone: string | null = extractTelephone(text);
    let linkedin: string | null = extractLinkedIn(text);
    let adresse: string | null = guessAddress(text);

    // Heuristiques / extraits initiaux
    const guessed = guessNameAmeliore(text, filename);
    if (guessed.nom) nom = guessed.nom;
    if (guessed.prenom) prenom = guessed.prenom;

    const experiences = extractExperiencesAmeliorees(text);
    const formations = extractFormationsAmeliorees(text);
    let competences = extractCompetencesAmeliorees(text);
    let metiers = extractMetiersFromText(text);
    const niveau = extractNiveauFromFormationsAmeliore(formations);
    const langues = extractLanguesFromText(text);
    let postes = extractPostesFromExperiences(experiences);
    const profil = extractProfilFromText(text);
    let entreprise = extractEntreprisePrincipale(experiences);

    // --- Appel NER externe (si configuré) ---
    try {
      const nerResp = await callNerService(text);
      if (nerResp?.ok) {
        const summary = nerResp.summary || {};
        // PERSON detection
        if (summary.PERSON?.text) {
          const parts = summary.PERSON.text.trim().split(/\s+/);
          if (parts.length >= 2) {
            if (!prenom) prenom = parts[0];
            if (!nom) nom = parts.slice(1).join(" ");
          } else {
            if (!nom) nom = summary.PERSON.text.trim();
          }
        }
        // ORG
        if (summary.ORG?.text && !entreprise) entreprise = summary.ORG.text;
        // JOB/TITLE
        const titleText = (summary.JOB?.text || summary.TITLE?.text);
        if (titleText) {
          // prepend to postes & metiers if new
          if (titleText && !postes.includes(titleText)) postes = [titleText].concat(postes).slice(0, 10);
          if (titleText && !metiers.includes(titleText)) metiers = [titleText].concat(metiers).slice(0, 10);
        }
        // SKILL entities
        if (Array.isArray(nerResp.entities)) {
          for (const e of nerResp.entities) {
            if ((e.label === "SKILL" || e.label === "COMPETENCE") && e.text) {
              const s = e.text.trim();
              if (!competences.includes(s)) competences.push(s);
            }
            // Some NERs produce JOB/TITLE per-entity - collect them
            if ((e.label === "JOB" || e.label === "TITLE") && e.text) {
              const t = e.text.trim();
              if (!postes.includes(t)) postes.push(t);
              if (!metiers.includes(t)) metiers.push(t);
            }
          }
        }
      }
    } catch (error: any) {
      console.warn("⚠️ NER call failed:", error?.message ?? String(error));
      // continuer avec heuristiques
    }

    // dédup & normalize competences/metiers/postes
    competences = uniqueKeepOrder(competences).slice(0, 50);
    metiers = uniqueKeepOrder(metiers).slice(0, 10);
    postes = uniqueKeepOrder(postes).slice(0, 10);

    const anneesExperience = calculateAnneesExperience(experiences);

    const candidat: Candidat = {
      fichier: filename,
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      telephone: telephone || null,
      poste: postes.length > 0 ? postes[0] : null,
      entreprise: entreprise || null,
      profil: profil || null,
      competences: competences,
      metiers: metiers,
      formations: formations,
      experiences: experiences,
      langues: langues,
      adresse: adresse || null,
      linkedin: linkedin || null,
      niveau: niveau || null,
      cv_filename: filename,
      annees_experience: anneesExperience,
      postes: postes.slice(0, 5),
      source_analyse: "document_parser",
      raw_text: text
    };

    return candidat;
  } catch (error: any) {
    console.error("❌ extractCVData error:", error);
    // fallback minimal
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
      source_analyse: "document_parser_error",
      raw_text: ""
    };
  }
}

/* --- Guess name (fallback) --- */
function guessNameAmeliore(_raw: string, _filename: string): { nom: string | null; prenom: string | null } {
  const lines = _raw.split("\n").slice(0, 6);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 3 && trimmed.length < 60 && /^[A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+\s+[A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+/.test(trimmed)) {
      const parts = trimmed.split(/\s+/);
      return { prenom: parts[0], nom: parts.slice(1).join(" ") };
    }
  }
  const baseName = _filename.replace(/\.[^.]+$/, "");
  const parts = baseName.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length >= 2) return { prenom: parts[0], nom: parts.slice(1).join(" ") };
  return { nom: null, prenom: null };
}