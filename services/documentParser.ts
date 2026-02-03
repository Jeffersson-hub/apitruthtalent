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
    console.warn(
      "⚠️ Erreur lecture dictionnaire",
      relPath,
      error?.message ?? String(error),
    );
    return [];
  }
}
const SKILL_LIST = loadJsonList("dictionaries/skills.json");
const TITLE_LIST = loadJsonList("dictionaries/titles.json");

const skillFuse = new Fuse(SKILL_LIST, {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
});
const titleFuse = new Fuse(TITLE_LIST, {
  includeScore: true,
  threshold: 0.35,
  ignoreLocation: true,
});

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

// Fonctions utilitaires pour nettoyer
function cleanJobTitle(title: string): string {
  return title
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/\b(à|chez|at)\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCompanyName(company: string): string {
  return company
    .replace(/\b(SA|SAS|SARL|EI|EURL|SASU)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Extraction PDF améliorée avec pdfjs-dist (version 5.x)
// Remplacer la fonction extractTextWithPdfJs par :
async function extractTextWithPdfJs(buffer: Buffer): Promise<string> {
  try {
    // Import dynamique pour pdfjs-dist v5.x
    const pdfjsLib = await import('pdfjs-dist');
    
    // Charger le document PDF - convertir Buffer en Uint8Array
    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    let fullText = "";
    
    // Parcourir toutes les pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      
      // Extraire le texte de chaque item
      const pageText = content.items
        .map((item: any) => item.str || '')
        .join(' ');
      
      fullText += pageText + '\n';
    }
    
    return fullText;
  } catch (error) {
    console.error("pdfjs-dist extraction failed:", error);
    return "";
  }
}

async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    let text = "";

    if (lower.endsWith(".pdf")) {
      // Essayer pdf-parse d'abord (rapide)
      try {
        const data = await pdfParse(buffer);
        text = data.text || "";
      } catch (error) {
        console.warn("pdf-parse failed, trying pdfjs-dist");
      }

      // Si extraction insuffisante (< 100 caractères), utiliser pdfjs-dist
      if (text.length < 100) {
        const pdfjsText = await extractTextWithPdfJs(buffer);
        if (pdfjsText.length > text.length) {
          text = pdfjsText;
        }
      }
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
  const match = _text.match(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi,
  );
  return match ? match[0] : null;
}

function extractTelephone(_text: string): string | null {
  const match = _text.match(
    /(\+33|0)[\s.-]?[1-9](?:[\s.-]?\d{2}){4}|\+?\d{7,15}/g,
  );
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
    if (res && res.length > 0 && (res[0] as any).score <= 0.35) {
      matches.push((res[0] as any).item);
    }
  }

  for (const s of SKILL_LIST) {
    if (text.includes(s.toLowerCase())) {
      matches.push(s);
    }
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
    if (res && res.length > 0 && (res[0] as any).score <= 0.35) {
      candidates.push((res[0] as any).item);
    }
  }

  const firstLines = _text.split("\n").slice(0, 8).join(" ");
  for (const t of TITLE_LIST) {
    if (normalize(firstLines).includes(t.toLowerCase())) {
      candidates.push(t);
    }
  }

  return uniqueKeepOrder(candidates).slice(0, 5);
}

/* --- Experiences basiques (chrono + heuristics) --- */
type Experience = {
  debut: string | null;
  fin: string | null;
  poste: string | null;
  entreprise: string | null;
  description?: string | null;
};

// Fonction pour parser les dates françaises
function parseFrenchDate(monthStr: string, yearStr: string): string | null {
  const months: { [key: string]: number } = {
    janvier: 0,
    février: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    août: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    décembre: 11,
  };

  try {
    const month = months[monthStr.toLowerCase()] ?? 0;
    const year = parseInt(yearStr);
    if (!isNaN(year)) {
      return new Date(Date.UTC(year, month, 1)).toISOString();
    }
  } catch (error) {
    return null;
  }
  return null;
}

// Fonction améliorée pour extraire les périodes
function parseDateRangeFromLineImproved(
  line: string,
): { debut: string | null; fin: string | null } | null {
  // Formats français améliorés
  const datePatterns = [
    // Mois année - Mois année
    /(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\s*[à\-]\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*(\d{4}|aujourd'hui|present|actuel)/i,
    // Année - Année
    /(\d{4})\s*[à\-]\s*(\d{4}|aujourd'hui|present|actuel)/i,
    // Depuis année
    /(depuis|since)\s+(\d{4})/i,
    // MM/YYYY - MM/YYYY
    /(\d{1,2}[\/\-\.]\d{4})\s*[à\-]\s*(\d{1,2}[\/\-\.]\d{4}|aujourd'hui)/i,
  ];

  for (const pattern of datePatterns) {
    const match = line.match(pattern);
    if (match) {
      try {
        let debut = null;
        let fin = null;

        if (match[1] && match[2]) {
          debut = parseFrenchDate(match[1], match[2]);
        }

        if (match[3] && match[4]) {
          fin = parseFrenchDate(match[3], match[4]);
        } else if (match[2] && !match[3]) {
          fin = parseFrenchDate("décembre", match[2]);
        }

        if (debut || fin) {
          return { debut, fin };
        }
      } catch (error) {
        continue;
      }
    }
  }

  // Essayer chrono-node comme fallback
  const results = chrono.parse(line);
  if (results && results.length > 0) {
    const first = results[0];
    const start = first.start ? first.start.date().toISOString() : null;
    const end = first.end ? first.end.date().toISOString() : null;
    if (start || end) return { debut: start, fin: end };
  }

  return null;
}

// Fonction fallback pour les expériences
function extractExperiencesFallback(text: string): Experience[] {
  const experiences: Experience[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Chercher des patterns d'expérience
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Si la ligne contient un pattern d'expérience
    if (
      /(?:développeur|ingénieur|consultant|manager|directeur|responsable|chef)/i.test(
        line,
      ) &&
      line.length < 100
    ) {
      // Chercher une date dans les lignes autour
      let debut = null;
      let fin = null;

      for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 3); j++) {
        const dateRange = parseDateRangeFromLineImproved(lines[j]);
        if (dateRange) {
          if (!debut) debut = dateRange.debut;
          if (!fin) fin = dateRange.fin;
        }
      }

      experiences.push({
        debut,
        fin,
        poste: cleanJobTitle(line),
        entreprise:
          i < lines.length - 1 ? cleanCompanyName(lines[i + 1]) : null,
        description: null,
      });
    }
  }

  return experiences.slice(0, 10);
}

// Fonction principale d'extraction d'expériences
function extractExperiencesAmeliorees(text: string): Experience[] {
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const experiences: Experience[] = [];
  let current: Experience | null = null;
  let bufferDesc: string[] = [];
  let inExperienceSection = false;

  // Détecter le début de la section expérience
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Détecter section expérience
    if (
      /expérience|experience|work|employment|professional|professionnel|parcours/i.test(
        line,
      ) &&
      line.length < 50
    ) {
      inExperienceSection = true;
      continue;
    }

    if (!inExperienceSection && i > 10) {
      // Si pas trouvé de section après 10 lignes, considérer tout le texte
      inExperienceSection = true;
    }

    if (!inExperienceSection) continue;

    // Détecter une nouvelle expérience
    const dateRange = parseDateRangeFromLineImproved(line);
    const hasYear = /\b(19|20)\d{2}\b/.test(line);
    const looksLikeJobTitle =
      /(?:développeur|ingénieur|consultant|manager|directeur|responsable|chef de projet)/i.test(
        line,
      ) && line.length < 100;

    if (dateRange || (hasYear && looksLikeJobTitle)) {
      // Sauvegarder l'expérience précédente
      if (current) {
        current.description = bufferDesc.join(" ").trim() || null;
        experiences.push(current);
      }

      bufferDesc = [];

      // Chercher poste et entreprise dans les lignes autour
      let poste: string | null = null;
      let entreprise: string | null = null;

      // Chercher dans les 3 lignes précédentes
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const candidate = lines[j];
        if (candidate && candidate.length > 3 && candidate.length < 100) {
          if (!poste && !/\b(19|20)\d{2}\b/.test(candidate)) {
            poste = candidate;
          } else if (!entreprise) {
            entreprise = candidate;
          }
        }
      }

      // Chercher dans les 3 lignes suivantes
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const candidate = lines[j];
        if (candidate && candidate.length > 3 && candidate.length < 100) {
          if (!poste && !/\b(19|20)\d{2}\b/.test(candidate)) {
            poste = candidate;
          } else if (!entreprise && !/\b(19|20)\d{2}\b/.test(candidate)) {
            entreprise = candidate;
          }
        }
      }

      // Nettoyer le poste et l'entreprise
      if (poste) poste = cleanJobTitle(poste);
      if (entreprise) entreprise = cleanCompanyName(entreprise);

      current = {
        debut: dateRange?.debut || null,
        fin: dateRange?.fin || null,
        poste,
        entreprise,
        description: null,
      };
    } else if (current) {
      // Accumuler la description
      if (line.length > 10 && !line.includes("•") && !line.includes("●")) {
        bufferDesc.push(line);
      }
    }
  }

  // Ajouter la dernière expérience
  if (current) {
    current.description = bufferDesc.join(" ").trim() || null;
    experiences.push(current);
  }

  // Fallback si aucune expérience trouvée
  if (experiences.length === 0 && lines.length > 5) {
    // Chercher des patterns d'expérience dans tout le texte
    const fallbackExp = extractExperiencesFallback(text);
    if (fallbackExp.length > 0) {
      return fallbackExp.slice(0, 10);
    }
  }

  return experiences.slice(0, 15);
}

/* --- Autres utilitaires --- */
function extractFormationsAmeliorees(_text: string): any[] {
  const formations: any[] = [];
  const lines = _text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /(master|licence|bts|bac|ingénieur|dipl[oô]me|formation)/i.test(
        trimmed,
      ) &&
      trimmed.length > 10
    ) {
      formations.push({ intitule: trimmed, ecole: null, raw: trimmed });
    }
  }
  return formations.slice(0, 5);
}

function extractNiveauFromFormationsAmeliore(
  _formations: any[],
): string | null {
  if (!Array.isArray(_formations) || _formations.length === 0) return null;
  for (const formation of _formations) {
    const text = (formation.intitule || formation.raw || "")
      .toString()
      .toLowerCase();
    if (!text) continue;
    if (text.includes("doctorat") || text.includes("phd")) return "Doctorat";
    if (text.includes("master") || text.includes("mastère")) return "BAC+5";
    if (text.includes("licence") || text.includes("bachelor")) return "BAC+3";
    if (text.includes("bts") || text.includes("dut")) return "BAC+2";
    if (text.includes("bac") && !text.includes("bac+")) return "BAC";
    if (text.includes("cap") || text.includes("bep")) return "CAP/BEP";
  }
  return null;
}

function extractLanguesFromText(_text: string): any[] {
  const langues: any[] = [];
  const t = _text?.toLowerCase() || "";
  if (t.includes("anglais"))
    langues.push({ langue: "Anglais", niveau: "Intermédiaire" });
  if (t.includes("français"))
    langues.push({ langue: "Français", niveau: "Natif" });
  if (t.includes("espagnol"))
    langues.push({ langue: "Espagnol", niveau: "Débutant" });
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
  const t = (_text || "").toLowerCase();
  if (t.includes("développeur")) return "Développeur";
  if (t.includes("ingénieur")) return "Ingénieur";
  if (t.includes("technicien")) return "Technicien";
  if (t.includes("commercial")) return "Commercial";
  return null;
}

function extractEntreprisePrincipale(_experiences: any[]): string | null {
  if (!_experiences || _experiences.length === 0) return null;
  return _experiences[0].entreprise || null;
}

function calculateAnneesExperience(experiences: any[]): number {
  if (!Array.isArray(experiences) || experiences.length === 0) return 0;
  let totalYears = 0;
  for (const exp of experiences) {
    try {
      const start = exp.debut ? new Date(exp.debut) : null;
      const end = exp.fin ? new Date(exp.fin) : new Date();
      if (
        start &&
        !isNaN(start.getTime()) &&
        end &&
        !isNaN(end.getTime()) &&
        end >= start
      ) {
        totalYears +=
          end.getFullYear() -
          start.getFullYear() +
          (end.getMonth() - start.getMonth()) / 12;
      }
    } catch (error: any) {
      /* ignore */
    }
  }
  return Math.round(totalYears * 10) / 10;
}

/* --- Guess name amélioré --- */
function guessNameAmeliore(
  raw: string,
  filename: string,
): { nom: string | null; prenom: string | null } {
  const lines = raw.split("\n").slice(0, 10);

  const namePatterns = [
    /^([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+)\s+([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+)*)$/,
    /^(?:M\.|Mme|Mlle|Mr|Monsieur|Madame|Mademoiselle)\s+([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+)\s+([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+)/i,
    /^(?:Nom\s*:?\s*)([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿéèêë'_-]+)*)/i,
    /^(?:Prénom\s*:?\s*)([A-ZÀ-Ÿ][a-zà-ÿéèêë'_-]+)/i,
    /^([A-ZÀ-Ÿ][A-ZÀ-Ÿ\s]+)$/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    for (const pattern of namePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          const parts = match[2].split(/\s+/);
          if (parts.length >= 2) {
            return { prenom: parts[0], nom: parts.slice(1).join(" ") };
          }
          return { prenom: match[1], nom: match[2] };
        }

        if (match[1]) {
          const parts = match[1].split(/\s+/);
          if (parts.length >= 2) {
            return { prenom: parts[0], nom: parts.slice(1).join(" ") };
          }
        }
      }
    }
  }

  const baseName = filename.replace(/\.[^.]+$/, "");
  const parts = baseName.split(/[_\-\s.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return { prenom: parts[0], nom: parts.slice(1).join(" ") };
  }

  return { nom: null, prenom: null };
}

/* --- Export principal : extractCVData --- */
export async function extractCVData(
  buffer: Buffer,
  filename: string,
  _supabase: any,
): Promise<Candidat> {
  try {
    const text = await readText(buffer, filename);

    // Initialisation des variables
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
        const titleText = summary.JOB?.text || summary.TITLE?.text;
        if (titleText) {
          // prepend to postes & metiers if new
          if (titleText && !postes.includes(titleText))
            postes = [titleText].concat(postes).slice(0, 10);
          if (titleText && !metiers.includes(titleText))
            metiers = [titleText].concat(metiers).slice(0, 10);
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

    // Calcul du score de confiance
    let confidenceScore = 0;
    if (nom && prenom) confidenceScore += 30;
    if (email) confidenceScore += 20;
    if (telephone) confidenceScore += 15;
    if (experiences.length > 0)
      confidenceScore += Math.min(20, experiences.length * 5);
    if (competences.length > 0)
      confidenceScore += Math.min(10, competences.length * 2);
    if (formations.length > 0) confidenceScore += 5;

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
      raw_text: text,
      // confidence_score: confidenceScore,
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
      raw_text: "",
      // confidence_score: 0,
    };
  }
}
