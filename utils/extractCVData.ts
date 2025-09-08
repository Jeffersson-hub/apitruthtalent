// utils/extractCVData.ts
import type { Candidat, Experience, Formation, Langue } from "../types/candidats";

type ParsedLists = {
  profils: string[];
  competences: string[];
  experiences: Experience[];
  formations: Formation[];
  metiers: string[];
  langues: Langue[];
};

async function loadDictionary(supabase: any, path: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from("dictionaries")
    .download(`dictionaries/${path}`);

  if (error || !data) {
    console.error(`Erreur lors du téléchargement du dictionnaire ${path}:`, error?.message);
    return [];
  }

  const text = await data.text();
  return JSON.parse(text);
}

async function updateDictionary(supabase: any, path: string, newEntries: string[]): Promise<void> {
  const currentDict = await loadDictionary(supabase, path);
  const updatedDict = [...new Set([...currentDict, ...newEntries])];

  const { error } = await supabase.storage
    .from("truthtalent")
    .upload(
      `dictionaries/${path}`,
      new Blob([JSON.stringify(updatedDict, null, 2)], { type: "application/json" }),
      { upsert: true }
    );

  if (error) {
    console.error(`Erreur lors de la mise à jour du dictionnaire ${path}:`, error?.message);
  }
}

export async function extractCVData(buffer: Buffer, filename: string, supabase: any): Promise<Candidat> {
  const raw = await readText(buffer, filename);

  console.log("===== RAW TEXT =====");
  console.log(raw.slice(0, 2000));

  const email =
    (raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [null])[0] || null;
  const telephone =
    (raw.match(/(\+33|0)[\s\.]?[1-9](?:[\s\.]?\d{2}){4}/) || [null])[0] ||
    (raw.match(/\+?[0-9][0-9\s\.\-()]{7,}/) || [null])[0] ||
    null;

  const linkedin =
    (raw.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i) || [null])[0] || null;
  const lien = Array.from(
    new Set((raw.match(/https?:\/\/[^\s)]+/gi) || []).slice(0, 50))
  );

  const { nom, prenom } = guessName(raw, filename);
  const adresse = guessAddress(raw);

  console.log("Extraction pour", filename, { nom, prenom, email, telephone });

  const lists = parseStructuredLists(raw);

  const competencesDict = await loadDictionary(supabase, "competences.json");
  const metiersDict = await loadDictionary(supabase, "metiers.json");
  const formationsDict = await loadDictionary(supabase, "formations.json");
  const postesDict = await loadDictionary(supabase, "postes.json");
  const profilsDict = await loadDictionary(supabase, "profils.json");

  const competences = await normalizeWithDictionary(
    lists.competences,
    competencesDict,
    supabase,
    "competences.json"
  );

  const metiers = await normalizeWithDictionary(
    lists.metiers,
    metiersDict,
    supabase,
    "metiers.json"
  );

  const formations = await normalizeWithDictionary(
    lists.formations
      .map((f) => f.intitule)
      .filter((f): f is string => !!f),
    formationsDict,
    supabase,
    "formations.json"
  );

  const postes = await normalizeWithDictionary(
    lists.experiences
      .map((e) => e.poste)
      .filter((p): p is string => !!p),
    postesDict,
    supabase,
    "postes.json"
  );

  const profils = await normalizeWithDictionary(
    lists.profils,
    profilsDict,
    supabase,
    "profils.json"
  );

  const candidat: Candidat = {
    fichier: filename,
    nom,
    prenom,
    email,
    telephone,
    adresse,
    linkedin,
    competences,
    metiers,
    formations: lists.formations,
    experiences: lists.experiences,
    langues: lists.langues,
    postes,
    profil: profils.length ? profils[0] : null,
    entreprise: null,
  };

  return candidat;
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
      (dictItem) => dictItem.trim().toLowerCase() === normalizedItem
    );

    if (exists) {
      normalizedItems.push(item);
    } else {
      newItems.push(item);
      normalizedItems.push(item);
    }
  }

  if (newItems.length > 0) {
    await updateDictionary(supabase, dictPath, newItems);
  }

  return normalizedItems;
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
    throw new Error("Format .doc non supporté. Convertis en .docx ou .pdf.");
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

function guessName(raw: string, filename: string): {
  nom: string | null;
  prenom: string | null;
} {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let nom: string | null = null;
  let prenom: string | null = null;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const words = lines[i].split(/[ \t]+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5 && !/curriculum|cv/i.test(lines[i])) {
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
  const m = raw.match(/\b(0[1-9]|[1-8]\d|9[0-8])\d{3}\b[^\n]*\n?/);
  return m ? m[0].trim() : null;
}

function parseStructuredLists(raw: string): ParsedLists {
  const competencesText = extractSection(
    raw,
    /(compétences?|skills?)/i,
    /(expériences?|experience|profils?|profile|formation|education|langues?|languages?|centres|hobbies)/i
  );
  const experiencesText = extractSection(
    raw,
    /(expériences?|experience)/i,
    /(formation|education|compétences?|skills?|langues?|languages?)/i
  );
  const formationsText = extractSection(
    raw,
    /(formation|education)/i,
    /(expériences?|experience|compétences?|skills?|langues?|languages?)/i
  );
  const languesText = extractSection(
    raw,
    /(langues?|languages?)/i,
    /(formation|education|expériences?|experience|compétences?|skills?)/i
  );
  const metiersText = extractSection(
    raw,
    /(métier|job title|intitulé|poste recherché|objectif)/i,
    /(compétences?|skills?|expériences?|experience|formation|education|langues?|languages?)/i
  );
  const profilsText = extractSection(raw, /(profil|profils)/i, /(expériences?|formation|skills?)/i);

  const competences = toList(competencesText);
  const profils = toList(profilsText);
  const metiers = toList(metiersText).slice(0, 5);
  const experiences = toExperiences(experiencesText);
  const formations = toFormations(formationsText);
  const langues = toLangues(languesText);

  return { competences, experiences, formations, langues, metiers, profils };
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
    "iu"
  );

  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const joined = lines.join(" • ");
    const mDate = joined.match(dateRe);
    const range = mDate ? mDate[0] : null;
    const [date_debut, date_fin] = range
      ? range.split(/[-–—]/).map((s) => s.trim())
      : [undefined, undefined];

    const titreLine = lines[0];
    let titre: string | null = null;
    let entreprise: string | null = null;

    if (titreLine.includes(" - ")) {
      const [t, e] = titreLine.split(" - ");
      titre = t?.trim() || null;
      entreprise = e?.trim() || null;
    } else {
      titre = titreLine || null;
      const eLine = lines.slice(1, 3).find((l) =>
        /sas|sa|sarl|ltd|inc|gmbh|entreprise|company/i.test(l)
      );
      entreprise = eLine || null;
    }

    out.push({
      poste: titre,
      entreprise,
      periode: range || null,
      debut: date_debut,
      fin: date_fin,
    });
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

    const diplome = sanitizeEmpty(lines[0]);
    const ecole = sanitizeEmpty(lines[1]);

    const dateRe =
      /(?:\b(?:\d{4})\b)|(?:(?:janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{4})/gi;
    const dates = b.match(dateRe) || [];
    const date_debut = dates[0];
    const date_fin = dates[1];

    out.push({
      intitule: diplome,
      ecole: ecole,
      raw: b,
    });
  }
  return out.slice(0, 50);
}

function toLangues(section: string): Langue[] {
  if (!section) return [];
  return toList(section).map((x) => {
    const m = x.match(/^(.+?)(?:\s*\((.+)\))?$/);
    return {
      langue: m?.[1]?.trim() || x,
      niveau: m?.[2]?.trim() || "",
    };
  });
}

function sanitizeEmpty<T extends string | undefined | null>(v: T): string | null {
  if (!v) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
