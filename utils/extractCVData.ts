// utils/extractCVData.ts
import type { Candidat, Experience, Formation, Langue } from "../types/candidats";

type ParsedLists = {
  langues: Langue[];
  competences: string[];
  experiences: Experience[];
  formations: Formation[];
  metiers: string[];
};

export async function extractCVData(buffer: Buffer, filename: string): Promise<Candidat> {
  const raw = await readText(buffer, filename);

  // Champs simples
  const email = (raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [null])[0];
  const telephone =
    (raw.match(/(\+33|0)[\s\.]?[1-9](?:[\s\.]?\d{2}){4}/) || [null])[0] ||
    (raw.match(/\+?[0-9][0-9\s\.\-()]{7,}/) || [null])[0];

  const linkedin = (raw.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i) || [null])[0];
  const links = Array.from(new Set((raw.match(/https?:\/\/[^\s)]+/gi) || []).slice(0, 50)));

  const { nom, prenom } = guessName(raw, filename);
  const adresse = guessAddress(raw);

  // Sections structurées
  const lists = parseStructuredLists(raw);

  const candidat: Candidat = {
  fichier: filename,
  nom: nom || null,
  prenom: prenom || null,
  email: email || null,
  telephone: telephone || null,
  adresse: adresse || null,
  poste: null,
  entreprise: null,
  profil: null,
  linkedin: linkedin || null,   // ou lien si c’est le champ attendu
  competences: lists.competences,
  metiers: lists.metiers,
  experiences: lists.experiences,
  formations: lists.formations,
  langues: lists.langues,
  //links, // ⚠️ si ta table a bien un champ jsonb "links"
  // raw_text: raw, // ❌ retire si pas dans le type Candidat
};


  return candidat;
}

/* -------------------- Helpers -------------------- */

async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return normalize(data.text || "");
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    return normalize(value || "");
  }
  if (lower.endsWith(".doc")) {
    // .doc (binaire) non supporté proprement en serverless
    // -> vois la note en bas pour 3 options
    throw new Error("Format .doc non supporté en environnement serverless. Convertis en .docx ou .pdf.");
  }
  return normalize(buffer.toString("utf8"));
}

function normalize(s: string): string {
  return s
    .replace(/\u0000/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function guessName(raw: string, filename: string): { nom: string | null; prenom: string | null } {
  // Heuristique : première ligne majuscules → nom, seconde → prénom
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let nom: string | null = null;
  let prenom: string | null = null;

  // Cherche une ligne avec 2 mots au début du CV
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const words = lines[i].split(/[ \t]+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 && !/curriculum|cv/i.test(lines[i])) {
      // ex: "Jean Dupont" ou "DUPONT Jean"
      if (isMostlyUpper(words[0])) {
        nom = words[0];
        prenom = words.slice(1).join(" ");
      } else {
        prenom = words[0];
        nom = words.slice(1).join(" ");
      }
      break;
    }
  }

  // fallback: depuis le nom de fichier
  if (!nom || !prenom) {
    const base = filename.replace(/\.[^.]+$/, "");
    const parts = base.split(/[_\-\s]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (isMostlyUpper(parts[0])) {
        nom = nom || parts[0];
        prenom = prenom || parts.slice(1).join(" ");
      } else {
        prenom = prenom || parts[0];
        nom = nom || parts.slice(1).join(" ");
      }
    }
  }
  return { nom: nom || null, prenom: prenom || null };
}

function isMostlyUpper(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (!letters) return false;
  const uppers = letters.replace(/[a-zà-öø-ÿ]/g, "");
  return uppers.length / letters.length > 0.6;
}

function guessAddress(raw: string): string | null {
  // Heuristique simple : ligne avec code postal FR + ville
  const m = raw.match(/\b(0[1-9]|[1-8]\d|9[0-8])\d{3}\b[^\n]*\n?/);
  return m ? m[0].trim() : null;
}

function parseStructuredLists(raw: string): ParsedLists {
  // Découpe par sections (en FR & EN)
  const competencesText = extractSection(raw, /(compétences?|skills?)/i, /(expériences?|experience|profils?|profile|formation|education|langues?|languages?|centres|hobbies)/i);
  const experiencesText = extractSection(raw, /(expériences?|experience)/i, /(formation|education|compétences?|skills?|langues?|languages?)/i);
  const formationsText  = extractSection(raw, /(formation|education)/i, /(expériences?|experience|compétences?|skills?|langues?|languages?)/i);
  const languesText     = extractSection(raw, /(langues?|languages?)/i, /(formation|education|expériences?|experience|compétences?|skills?)/i);
  const metiersText     = extractSection(raw, /(métier|job title|intitulé|poste recherché|objectif)/i, /(compétences?|skills?|expériences?|experience|formation|education|langues?|languages?)/i);

  // Listes simples (string[])
  const competences = toList(competencesText);
  const metiers = toList(metiersText).slice(0, 5);

  // Expériences / Formations / Langues → objets typés
  const experiences = toExperiences(experiencesText);
  const formations = toFormations(formationsText);
  const langues = toLangues(languesText);

  return { competences, experiences, formations, langues, metiers };
}

function extractSection(raw: string, startRe: RegExp, stopRe: RegExp): string {
  const mStart = startRe.exec(raw);
  if (!mStart) return "";
  const startIdx = mStart.index + (mStart[0]?.length || 0);
  const rest = raw.slice(startIdx);
  const mStop = stopRe.exec(rest);
  const stopIdx = mStop ? mStop.index : rest.length;
  return rest.slice(0, stopIdx).trim();
}

function toList(section: string): string[] {
  if (!section) return [];
  return section
    .split(/\n|•|●|▪|–|-|—/g)
    .map((s) => s.replace(/^[•●▪–—-]\s*/, "").trim())
    .filter((s) => s.length > 1)
    .slice(0, 200);
}

function toExperiences(section: string): Experience[] {
  if (!section) return [];
  const blocks = section.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: Experience[] = [];

  const dateRe = new RegExp(
    `((?:janv\\.?|févr\\.?|mars|avr\\.?|mai|juin|juil\\.?|août|sept\\.?|oct\\.?|nov\\.?|déc\\.?
       |jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\\s*\\d{4}|\\d{4})
      \\s*[-–—]\\s*
     ((?:aujourd.?hui|présent|present|now|actuel|current|
       (?:janv\\.?|févr\\.?|mars|avr\\.?|mai|juin|juil\\.?|août|sept\\.?|oct\\.?|nov\\.?|déc\\.?
        |jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\\s*\\d{4}|\\d{4}))`,
    "iux"
  );

  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const joined = lines.join(" • ");

    const mDate = joined.match(dateRe);
    const range = mDate ? mDate[0] : null;
    const [date_debut, date_fin] = range ? range.split(/[-–—]/).map((s) => s.trim()) : [undefined, undefined];

    // Titre + entreprise (heuristique)
    const titreLine = lines[0];
    let titre: string | undefined;
    let entreprise: string | undefined;

    if (titreLine.includes(" - ")) {
      const [t, e] = titreLine.split(" - ");
      titre = t?.trim();
      entreprise = e?.trim();
    } else {
      titre = titreLine;
      // Essaye de trouver une ligne qui ressemble à une entreprise
      const eLine = lines.slice(1, 3).find((l) => /sas|sa|sarl|ltd|inc|gmbh|entreprises?|company|ltd\./i.test(l));
      entreprise = eLine || undefined;
    }

    const description = lines.slice(1).join("\n");

  }
  return out.slice(0, 50);
}

function toFormations(section: string): Formation[] {
  if (!section) return [];
  const blocks = section.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: Formation[] = [];

  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Heuristique : 1ère ligne = diplôme, 2e = école, le reste = description
    const diplome = sanitizeEmpty(lines[0]);
    const ecole = sanitizeEmpty(lines[1]);
    const description = sanitizeEmpty(lines.slice(2).join("\n"));

    // Dates (année ou mois/année) si présentes dans le bloc
    const dateRe = /(?:\b(?:\d{4})\b)|(?:(?:janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{4})/gi;
    const dates = b.match(dateRe) || [];
    const date_debut = dates[0];
    const date_fin = dates[1];

    out.push({
      diplome,
      ecole,
      //lieu: undefined,
      // date_debut,
      // date_fin,
      // description,
    });
  }
  return out.slice(0, 50);
}

function toLangues(section: string): Langue[] {
  if (!section) return [];
  const items = toList(section);
  const out: Langue[] = items.map((x) => {
    // ex: "Anglais (Courant)" → langue=Anglais, niveau=Courant
    const m = x.match(/^(.+?)(?:\s*\((.+)\))?$/);
    return {
        langue: (m?.[1]?.trim() || x),
      niveau: (m?.[2]?.trim() || ""), // string obligatoire
    };
  });
  return out.slice(0, 20);
}

function sanitizeEmpty<T extends string | undefined | null>(v: T): T {
  if (!v) return v;
  const s = String(v).trim();
  return (s.length ? (s as T) : (undefined as T));
}
