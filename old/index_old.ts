import express from "express";
import fetch from "node-fetch";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  }).listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
  });
});

// const app = express();
app.use(express.json({ limit: "10mb" }));

// ---------- Regex & helpers (simple mais efficaces) ----------
const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneRe = /(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const urlRe   = /\bhttps?:\/\/[^\s)]+/gi;
const nameRe  = /\b([A-ZÉÀÂÄ][a-zéèêëàâäîïôöùûüç'-]+)\s+([A-ZÉÀÂÄ][A-Za-zéèêëàâäîïôöùûüç'-]+)\b/;

function splitName(text: string) {
  const m = text.match(nameRe);
  return { prenom: m?.[1] ?? null, nom: m?.[2] ?? null };
}
function extractLinkedIn(text: string) {
  const m = text.match(/linkedin\.com\/(?:in|pub)\/[a-z0-9\-_%]+/i);
  return m ? m[0] : null;
}
function unique<T>(arr: T[]) { return Array.from(new Set(arr)); }

function extractCompetencesByDict(text: string, dict: string[]): string[] {
  const low = text.toLowerCase();
  return unique(dict.filter(x => low.includes(x.toLowerCase())));
}
function extractExperiences(text: string) {
  // ultra simple: séquences "YYYY - YYYY ...", à améliorer selon ton besoin
  const re = /\b(19|20)\d{2}\s*[-–]\s*((19|20)\d{2}|présent|aujourd'hui)\b([\s\S]*?)(?=\b(19|20)\d{2}\s*[-–]\s*((19|20)\d{2}|présent|aujourd'hui)\b|$)/gi;
  const out: any[] = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      debut: m[1] ? m[0].slice(0,4) : null,
      fin:   m[2],
      description: m[4].trim().slice(0, 2000)
    });
  }
  return out;
}
function extractFormations(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return lines
    .filter(l => /(bac|licence|master|bts|dut|ingénieur|école|formation|dipl[oô]me)/i.test(l))
    .map(l => ({ raw: l.trim() }))
    .slice(0, 50);
}
function extractLangues(text: string) {
  const langs = ['français','anglais','espagnol','allemand','italien','portugais','arabe','chinois','mandarin','japonais','russe','néerlandais','turc','polonais'];
  const levels = ['A1','A2','B1','B2','C1','C2','débutant','intermédiaire','avancé','courant','bilingue','natif','native'];
  const lines = text.split(/\r?\n/);
  const out: any[] = [];
  for (const line of lines) {
    const l = langs.find(x => line.toLowerCase().includes(x));
    if (!l) continue;
    const n = levels.find(x => line.toLowerCase().includes(x.toLowerCase())) ?? '';
    if (!out.some(y => y.langue === l && y.niveau === n)) out.push({ langue: l, niveau: n });
  }
  return out;
}

// ---------- Dictionnaires (tu peux remplacer par tes JSON) ----------
const competencesDict = ["javascript","typescript","react","node","sql","python","docker","aws","gcp","azure","postgresql","supabase"];
const metiersDict = ["développeur","data engineer","data scientist","product manager","devops","fullstack","frontend","backend"];
const profilsDict = ["Ingénieur Logiciel","Développeur Fullstack","Chef de projet"];

// ---------- Utils ----------
async function fetchArrayBuffer(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed: ${r.status}`);
  const buf = await r.arrayBuffer();
  return Buffer.from(buf);
}
async function bufferToText(fileName: string, buf: Buffer) {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === "pdf") {
    const data = await pdfParse(buf);
    return data.text || "";
  }
  if (ext === "docx") {
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value || "";
  }
  return buf.toString("utf8");
}

// ---------- Endpoint principal ----------
app.post("/parse", async (req, res) => {
  try {
    const { file_url, file_name } = req.body as { file_url: string; file_name: string };
    if (!file_url || !file_name) return res.status(400).json({ error: "file_url and file_name required" });

    const buf = await fetchArrayBuffer(file_url);
    const text = await bufferToText(file_name, buf);

    const { nom, prenom } = splitName(text);
    const email = (text.match(emailRe) ?? [null])[0];
    const telephone = (text.match(phoneRe) ?? [null])[0]?.replace(/\s+/g, '') ?? null;
    const links = unique(text.match(urlRe) ?? []);
    const linkedin = extractLinkedIn(text);
    const competences = extractCompetencesByDict(text, competencesDict);
    const metiers = extractCompetencesByDict(text, metiersDict);
    const experiences = extractExperiences(text);
    const formations = extractFormations(text);
    const langues = extractLangues(text);

    const payload = {
      fichier: file_name,
      nom, prenom, email, telephone, adresse: null,
      poste: null, entreprise: null, profil: profilsDict[0] ?? null,
      linkedin,
      competences, metiers, links,
      experiences, formations, langues,
      raw_text: text
    };

    res.json({ ok: true, data: payload });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Parser running on", port));
