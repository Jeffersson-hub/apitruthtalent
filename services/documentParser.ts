import type Candidat from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import * as chrono from "chrono-node";

// Dictionnaires simplifiés
const SKILLS = [
  "JavaScript", "TypeScript", "Python", "Java", "React", "Vue.js", "Angular",
  "Node.js", "Express", "Django", "Flask", "Spring", "AWS", "Azure", "Docker",
  "Kubernetes", "Git", "CI/CD", "SQL", "NoSQL", "MongoDB", "PostgreSQL",
  "HTML", "CSS", "SASS", "Webpack", "REST API", "GraphQL"
];

const TITLES = [
  "Développeur", "Ingénieur", "Consultant", "Manager", "Directeur",
  "Responsable", "Chef de projet", "Analyste", "Architecte", "Technicien"
];

// Initialiser Fuse.js


// Helper functions
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\-.,\/]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// Extraction PDF
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  try {
    const data = await pdfParse(Buffer.from(buffer));
    return data.text || "";
  } catch (error) {
    console.warn("PDF parse failed");
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(buffer);
  }
}

// Extraction Word
async function extractTextFromWord(buffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ 
      buffer: Buffer.from(buffer) 
    });
    return result.value || "";
  } catch (error) {
    console.warn("DOCX parse failed");
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(buffer);
  }
}

// Extraction email
function extractEmail(text: string): string | null {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

// Extraction téléphone
function extractPhone(text: string): string | null {
  const phoneRegex = /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}|\+\d{1,3}[\s.-]?\d{1,14}/g;
  const match = text.match(phoneRegex);
  return match ? match[0].replace(/\s/g, '') : null;
}

// Extraction LinkedIn
function extractLinkedIn(text: string): string | null {
  const linkedinRegex = /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[\w-]+/gi;
  const match = text.match(linkedinRegex);
  return match ? match[0] : null;
}

// Extraction nom
function extractName(text: string, filename: string): { firstName: string | null; lastName: string | null } {
  // Chercher dans les premières lignes
  const lines = text.split('\n').slice(0, 5);
  for (const line of lines) {
    const nameMatch = line.match(/^([A-ZÀ-Ÿ][a-zà-ÿ]+)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)$/);
    if (nameMatch) return { firstName: nameMatch[1], lastName: nameMatch[2] };
  }
  
  // Fallback sur nom de fichier
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split(/[_\-\s.]+/).filter(Boolean);
  if (parts.length >= 2) {
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
  
  return { firstName: null, lastName: null };
}

// Extraction compétences
function extractSkills(text: string): string[] {
  const normalized = normalize(text);
  const found: string[] = [];
  
  // Recherche directe
  for (const skill of SKILLS) {
    if (normalized.includes(normalize(skill))) {
      found.push(skill);
    }
  }
  
  return unique(found).slice(0, 20);
}

// Extraction titres
function extractTitles(text: string): string[] {
  const titles: string[] = [];
  const normalized = normalize(text);
  
  // Recherche directe
  for (const title of TITLES) {
    if (normalized.includes(normalize(title))) {
      titles.push(title);
    }
  }
  
  return unique(titles);
}

// Extraction expériences
function extractExperiences(text: string): any[] {
  const experiences: any[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Chercher une période
    const parsedDates = chrono.parse(line);
    if (parsedDates.length > 0) {
      const date = parsedDates[0];
      
      // Chercher le poste (ligne avant)
      let poste = null;
      if (i > 0) {
        poste = lines[i-1].trim();
      }
      
      // Chercher l'entreprise (ligne après)
      let entreprise = null;
      if (i < lines.length - 1) {
        entreprise = lines[i+1].trim();
      }
      
      experiences.push({
        debut: date.start ? date.start.date().toISOString() : null,
        fin: date.end ? date.end.date().toISOString() : null,
        poste,
        entreprise,
        description: null
      });
    }
  }
  
  return experiences.slice(0, 10);
}

// Extraction formations (simplifiée)
function extractEducation(text: string): string[] {
  const formations: string[] = [];
  const lines = text.split('\n');
  
  const educationKeywords = [
    'master', 'licence', 'bachelor', 'bts', 'dut', 'diplôme', 'formation',
    'école', 'université', 'bac', 'doctorat', 'phd', 'ingénieur'
  ];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const lowerLine = trimmed.toLowerCase();
    
    if (educationKeywords.some(keyword => lowerLine.includes(keyword)) && 
        trimmed.length > 10) {
      formations.push(trimmed);
    }
  }
  
  return formations.slice(0, 5);
}

// Extraction langues (simplifiée)
function extractLanguages(text: string): string[] {
  const langues: string[] = [];
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('français')) langues.push('Français');
  if (lowerText.includes('anglais')) langues.push('Anglais');
  if (lowerText.includes('espagnol')) langues.push('Espagnol');
  if (lowerText.includes('allemand')) langues.push('Allemand');
  
  return langues;
}

// Extraction adresse
function extractAddress(text: string): string | null {
  // Chercher code postal
  const cpMatch = text.match(/\b\d{5}\b/);
  return cpMatch ? cpMatch[0] : null;
}

// Détection niveau d'éducation
function detectEducationLevel(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('doctorat') || lowerText.includes('phd')) return 'Doctorat';
  if (lowerText.includes('master') || lowerText.includes('bac+5')) return 'BAC+5';
  if (lowerText.includes('licence') || lowerText.includes('bac+3')) return 'BAC+3';
  if (lowerText.includes('bts') || lowerText.includes('dut')) return 'BAC+2';
  if (lowerText.includes('bac') && !lowerText.includes('bac+')) return 'BAC';
  if (lowerText.includes('cap') || lowerText.includes('bep')) return 'CAP/BEP';
  
  return null;
}

// Calcul expérience totale
function calculateTotalExperience(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;
  
  let totalYears = 0;
  
  for (const exp of experiences) {
    try {
      const start = exp.debut ? new Date(exp.debut) : null;
      const end = exp.fin ? new Date(exp.fin) : new Date();
      
      if (start && end) {
        const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        if (years > 0) {
          totalYears += years;
        }
      }
    } catch (error) {
      // Ignorer les erreurs
    }
  }
  
  return Math.round(totalYears * 10) / 10;
}

// Détection profil
function detectProfile(skills: string[]): string {
  if (skills.some(s => ['javascript', 'typescript', 'react', 'vue', 'angular'].includes(s.toLowerCase()))) {
    return "Développeur";
  }
  if (skills.some(s => ['python', 'sql', 'machine learning', 'data science'].includes(s.toLowerCase()))) {
    return "Data";
  }
  if (skills.some(s => ['docker', 'kubernetes', 'aws', 'azure'].includes(s.toLowerCase()))) {
    return "DevOps";
  }
  return "Autre";
}

// Extraction entreprise
function extractCompany(text: string): string | null {
  const companyPatterns = [
    /(?:chez|at)\s+([A-ZÀ-Ÿ][\w\s&]+)/i,
    /entreprise\s*:\s*([A-ZÀ-Ÿ][\w\s&]+)/i
  ];
  
  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  
  return null;
}

// Parser principal
export async function parseCV(
  buffer: ArrayBuffer,
  filename: string,
  mimeType?: string
): Promise<Candidat> {
  try {
    // 1. Extraction texte selon le format
    let text = "";
    const lowerName = filename.toLowerCase();
    
    if (lowerName.endsWith('.pdf') || mimeType?.includes('pdf')) {
      text = await extractTextFromPDF(buffer);
    } else if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
      text = await extractTextFromWord(buffer);
    } else {
      // Texte brut
      const decoder = new TextDecoder('utf-8', { fatal: false });
      text = decoder.decode(buffer);
    }
    
    // Nettoyage
    text = text.replace(/\s+/g, ' ').trim();
    
    // 2. Extraction des entités
    const email = extractEmail(text);
    const phone = extractPhone(text);
    const linkedin = extractLinkedIn(text);
    const { firstName, lastName } = extractName(text, filename);
    
    // 3. Extraction données structurées
    const skills = extractSkills(text);
    const titles = extractTitles(text);
    const experiences = extractExperiences(text);
    const formations = extractEducation(text);
    const langues = extractLanguages(text);
    const adresse = extractAddress(text);
    const niveau = detectEducationLevel(text);
    const anneesExperience = calculateTotalExperience(experiences);
    const entreprise = extractCompany(text);
    const profil = detectProfile(skills);
    
    // 5. Construction de l'objet Candidat
    const candidat: Candidat = {
      fichier: filename,
      nom: lastName,
      prenom: firstName,
      email,
      telephone: phone,
      poste: titles[0] || null,
      entreprise: entreprise || null,
      profil,
      competences: skills,
      metiers: titles,
      formations,  // string[]
      experiences, // Experience[]
      langues,     // string[]
      adresse,
      linkedin,
      niveau,
      cv_filename: filename,
      annees_experience: anneesExperience,
      postes: titles.slice(0, 5),
      source_analyse: "document_parser",
      raw_text: text.substring(0, 1000)
    };
    
    return candidat;
    
  } catch (error: any) {
    console.error('CV parsing error:', error);
    
    // Retourner un candidat vide en cas d'erreur
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
      annees_experience: 0,
      postes: [],
      source_analyse: "error",
      raw_text: ""
    };
  }
}