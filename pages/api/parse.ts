// pages/api/parse.ts - VERSION CORRIGÉE
import { NextApiRequest, NextApiResponse } from 'next';
import fetch from "node-fetch";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

// Configuration CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

// ---------- Regex & helpers ----------
const emailRe = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneRe = /(\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const urlRe   = /\bhttps?:\/\/[^\s)]+/gi;
const nameRe  = /\b([A-ZÉÀÂÄ][a-zéèêëàâäîïôöùûüç'-]+)\s+([A-ZÉÀÂÄ][A-Za-zéèêëàâäîïôöùûüç'-]+)\b/;

function splitName(text: string) {
  const m = text.match(nameRe);
  return { prenom: m?.[1] ?? null, nom: m?.[2] ?? null };
}

function extractLinkedIn(text: string) {
  const m = text.match(/linkedin\.com\/(?:in|pub)\/[a-z0-9\-_%]+/gi);
  return m ? m[0] : null;
}

function unique<T>(arr: T[]) { return Array.from(new Set(arr)); }

function extractCompetencesByDict(text: string, dict: string[]): string[] {
  const low = text.toLowerCase();
  return unique(dict.filter(x => low.includes(x.toLowerCase())));
}

function extractExperiences(text: string) {
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

// ---------- Dictionnaires ----------
const competencesDict = ["javascript","typescript","react","node","sql","python","docker","aws","gcp","azure","postgresql","supabase"];
const metiersDict = ["développeur","data engineer","data scientist","product manager","devops","fullstack","frontend","backend"];
const profilsDict = ["Ingénieur Logiciel","Développeur Fullstack","Chef de projet"];

// ---------- Utils ----------
async function fetchArrayBuffer(url: string) {
  console.log("🔗 Téléchargement depuis:", url);
  
  // Vérifier que c'est une URL Supabase valide
  if (!url.includes('supabase.co')) {
    throw new Error('URL non autorisée: doit être une URL Supabase');
  }

  const r = await fetch(url, {
    //timeout: 30000,
    headers: {
      'User-Agent': 'TruthTalent-Parser/1.0'
    }
  });
  
  if (!r.ok) {
    console.error("❌ Erreur téléchargement:", r.status, r.statusText);
    
    // Gestion spécifique des erreurs Supabase
    if (r.status === 400) {
      throw new Error('URL invalide ou fichier non trouvé dans Supabase Storage');
    }
    if (r.status === 403) {
      throw new Error('Accès refusé - vérifiez les permissions du bucket');
    }
    if (r.status === 404) {
      throw new Error('Fichier non trouvé dans Supabase Storage');
    }
    
    throw new Error(`Download failed: ${r.status} ${r.statusText}`);
  }

  const buf = await r.arrayBuffer();
  console.log("✅ Téléchargement réussi, taille:", buf.byteLength, "bytes");
  return Buffer.from(buf);
}

async function bufferToText(fileName: string, buf: Buffer) {
  const ext = fileName.toLowerCase().split('.').pop();
  console.log("📄 Extraction texte, extension:", ext);
  
  if (ext === "pdf") {
    try {
      const data = await pdfParse(buf);
      console.log("✅ PDF parsé, texte longueur:", data.text?.length || 0);
      return data.text || "";
    } catch (error) {
      console.error("❌ Erreur parsing PDF:", error);
      throw new Error('Erreur lors de l\'extraction du PDF');
    }
  }
  
  if (ext === "docx") {
    try {
      const res = await mammoth.extractRawText({ buffer: buf });
      console.log("✅ DOCX parsé, texte longueur:", res.value?.length || 0);
      return res.value || "";
    } catch (error) {
      console.error("❌ Erreur parsing DOCX:", error);
      throw new Error('Erreur lors de l\'extraction du DOCX');
    }
  }
  
  // Pour les autres types, essayer de lire comme texte
  try {
    const text = buf.toString("utf8");
    console.log("✅ Texte brut, longueur:", text.length);
    return text;
  } catch (error) {
    throw new Error(`Format non supporté: ${ext}`);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("🔍 API Parse called - Method:", req.method);
  
  // Gestion CORS
  if (req.method === 'OPTIONS') {
    console.log("🔄 Préflight CORS");
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
    return res.status(200).end();
  }

  // Seulement POST autorisé
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file_url, file_name } = req.body as { file_url: string; file_name: string };
    console.log("📦 Request body:", { 
      file_url: file_url?.substring(0, 100) + '...', 
      file_name 
    });

    if (!file_url || !file_name) {
      console.log("❌ Missing parameters");
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(400).json({ error: "file_url and file_name required" });
    }

    console.log("⬇️ Downloading file...");
    const buf = await fetchArrayBuffer(file_url);

    if (buf.length === 0) {
      throw new Error("Fichier vide ou corrompu");
    }

    console.log("🔤 Extracting text...");
    const text = await bufferToText(file_name, buf);
    console.log("✅ Text extracted, length:", text.length);

    if (!text || text.length < 10) {
      console.log("❌ No text extracted");
      throw new Error("No text could be extracted from the file");
    }

    // Extraction des données
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
      nom, 
      prenom, 
      email, 
      telephone, 
      adresse: null,
      poste: null, 
      entreprise: null, 
      profil: profilsDict[0] ?? null,
      linkedin,
      competences, 
      metiers, 
      links,
      experiences, 
      formations, 
      langues,
      raw_text: text.substring(0, 1000) // Limiter pour les logs
    };

    console.log("✅ Analysis completed:", { 
      name: `${prenom} ${nom}`, 
      email, 
      skills: competences.length,
      experiences: experiences.length 
    });

    // Réponse avec CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
    
    res.json({ ok: true, data: payload });

  } catch (e: any) {
    console.error("💥 API Error:", e);
    
    // Réponse d'erreur avec CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info');
    
    res.status(500).json({ 
      ok: false, 
      error: e.message,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
}