// services/documentParser.ts
import { createClient } from '@supabase/supabase-js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Configurer le worker (nécessaire pour pdf.js)
GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';


// Interfaces étendues avec toutes les propriétés nécessaires
export interface CandidatData {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  poste?: string;
  entreprise?: string;
  competences: string[];
  metiers: string[];
  annees_experience?: number;
  experiences: any[];
  formations: any[];
  langues: any[];
  
  // Nouvelles propriétés
  raw_text?: string;
  metadata?: {
    filename: string;
    filetype: string;
    extraction_date: string;
    pages?: number;
    word_count?: number;
    language?: string;
  };
  profil?: string; // Résumé/profil professionnel
  adresse?: {
    rue?: string;
    ville?: string;
    code_postal?: string;
    pays?: string;
  };
  linkedin?: string;
  github?: string;
  portfolio?: string;
  niveau?: string;
  niveau_etude?: string;
  niveau_experience?: string;
  salaire_actuel?: number;
  salaire_souhaite?: number;
  disponibilite?: string;
  mobilite?: string[];
  soft_skills?: string[];
  certifications?: any[];
  projets?: any[];
}

export interface ParseCVResult {
  candidat: CandidatData;
  confidence_score: number;
  raw_text?: string;
  metadata?: {
    filename: string;
    filetype: string;
    extraction_date: string;
    parser_version: string;
    processing_time_ms: number;
  };
}

// services/documentParser.ts
async function parseCV(
  buffer: Buffer,
  filename: string,
  fileType: string
): Promise<ParseCVResult> {
  const startTime = Date.now();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Vérifier si ce CV a déjà été parsé (cache)
  const fileHash = require('crypto').createHash('md5').update(buffer.toString()).digest('hex');
  const { data: cached, error: cacheError } = await supabase
    .from('cv_cache')
    .select('*')
    .eq('file_hash', fileHash)
    .single();

  if (cached) {
    console.log('⚡ Utilisation du cache pour', filename);
    return {
      candidat: cached.candidat_data as CandidatData,
      confidence_score: cached.confidence_score,
      metadata: {
        ...cached.metadata,
        cached: true
      }
    };
  }

  // 2. Parser normalement si pas en cache
  const result = await performParsing(buffer, filename, fileType);

  // 3. Sauvegarder dans le cache
  await supabase.from('cv_cache').upsert({
    file_hash: fileHash,
    filename,
    candidat_data: result.candidat,
    confidence_score: result.confidence_score,
    metadata: result.metadata,
    created_at: new Date().toISOString()
  });

  return result;
}

async function performParsing(buffer: Buffer, filename: string, fileType: string): Promise<ParseCVResult> {
  // Logique existante de parsing (extractTextFromBuffer + callDeepSeekAPI)
  const rawText = await extractTextFromBuffer(buffer, filename, fileType);
  const extractedData = await callDeepSeekAPI(rawText, filename);
  return {
    candidat: extractedData,
    confidence_score: extractedData.confidence_score || 0.7,
    metadata: {
      filename,
      filetype: fileType,
      extraction_date: new Date().toISOString(),
      parser_version: '1.1.0',
      processing_time_ms: Date.now()
    }
  };
    

};

// Mettre à jour la fonction callDeepSeekAPI pour inclure toutes les données
async function callDeepSeekAPI(cvText: string, filename: string): Promise<any> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  
  if (!DEEPSEEK_API_KEY) {
    console.warn('⚠️ DEEPSEEK_API_KEY non configurée, utilisation du parser simulé');
    return simulateParsing(cvText, filename);
  }
  
  try {
    const prompt = `
Analyse ce CV professionnel et extrais TOUTES les informations dans un JSON structuré.
Respecte EXACTEMENT cette structure (ne retourne que du JSON valide) :

{
  "nom": "string",
  "prenom": "string",
  "email": "string",
  "telephone": "string|null",
  "poste": "string|null",
  "entreprise": "string|null",
  "profil": "string|null",
  "adresse": {
    "rue": "string|null",
    "ville": "string|null",
    "code_postal": "string|null",
    "pays": "string|null"
  },
  "linkedin": "string|null",
  "github": "string|null",
  "portfolio": "string|null",
  "competences": ["string"],
  "metiers": ["string"],
  "soft_skills": ["string"],
  "annees_experience": number|null,
  "niveau_experience": "Junior"|"Mid-level"|"Senior"|"Expert"|null,
  "experiences": [
    {
      "poste": "string",
      "entreprise": "string",
      "date_debut": "string|null", // Format: "2020-01" ou "2020"
      "date_fin": "string|null",
      "description": "string|null",
      "competences_utilisees": ["string"]
    }
  ],
  "formations": [
    {
      "diplome": "string",
      "etablissement": "string",
      "date_debut": "string|null",
      "date_fin": "string|null",
      "mention": "string|null"
    }
  ],
  "langues": [
    {
      "langue": "string",
      "niveau": "Débutant"|"Intermédiaire"|"Courant"|"Natif"
    }
  ],
  "certifications": [
    {
      "nom": "string",
      "organisme": "string",
      "date_obtention": "string|null"
    }
  ],
  "projets": [
    {
      "nom": "string",
      "description": "string|null",
      "technologies": ["string"],
      "date": "string|null"
    }
  ],
  "salaire_actuel": number|null,
  "salaire_souhaite": number|null,
  "disponibilite": "string|null",
  "mobilite": ["string"]|null,
  "confidence_score": number // 0 à 1
}

Règles strictes :
1. Si une information est manquante, mets-la à null (ne l'omets pas).
2. Les dates doivent être au format "AAAA-MM" ou "AAAA".
3. "competences" doit contenir UNIQUEMENT des compétences techniques (ex: "React", "Node.js").
4. "metiers" doit contenir des domaines/métiers (ex: "Développement Web", "Data Science").
5. "confidence_score" doit refléter ta confiance dans l'extraction (0.8 si tout est clair, 0.3 si incertain).

Texte du CV :
${cvText.substring(0, 15000)}  // Limite pour éviter de dépasser les tokens
`;

    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'Tu es un expert en extraction de données CV. Retourne uniquement du JSON valide.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      })
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const result = await response.json();
    const content = result.choices[0].message.content;
    
    // Nettoyer et parser le JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[0]);
      
      // Ajouter des métadonnées supplémentaires
      parsedData.metadata = {
        filename,
        extraction_date: new Date().toISOString(),
        parser: 'deepseek',
        confidence: parsedData.confidence_score || 0.8
      };
      
      return parsedData;
    }
    
    return simulateParsing(cvText, filename);
    
  } catch (error) {
    console.error('Erreur DeepSeek API:', error);
    return simulateParsing(cvText, filename);
  }
}

function simulateParsing(cvText: string, filename: string): any {
  const text = cvText.toLowerCase();
  const words = text.split(/\s+/).length;

  // Détection améliorée des informations
  const emailMatch = cvText.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  const phoneMatch = cvText.match(/(?:\+33|0)[1-9](?:[\s\.-]?\d{2}){4}/);
  const linkedinMatch = cvText.match(/linkedin\.com\/in\/([\w-]+)/);
  const githubMatch = cvText.match(/github\.com\/([\w-]+)/);

  // Compétences techniques courantes
  const techSkills = [
    'javascript', 'typescript', 'react', 'vue', 'angular', 'node', 'express',
    'python', 'django', 'flask', 'java', 'spring', 'c#', 'php', 'laravel',
    'sql', 'postgresql', 'mongodb', 'docker', 'kubernetes', 'aws', 'azure',
    'git', 'html', 'css', 'sass', 'webpack', 'graphql', 'rest', 'soap'
  ];

  const foundSkills = techSkills.filter(skill => text.includes(skill));

  // Expériences simulées
  const experiences = [];
  if (text.includes('développeur') || text.includes('developer')) {
    experiences.push({
      poste: 'Développeur Full Stack',
      entreprise: 'Entreprise Tech',
      date_debut: '2020-01',
      date_fin: '2023-12',
      description: 'Développement d\'applications web modernes'
    });
  }

  return {
    nom: 'Simulé',
    prenom: 'Candidat',
    email: emailMatch ? emailMatch[0] : 'candidat@example.com',
    telephone: phoneMatch ? phoneMatch[0] : null,
    poste: text.includes('développeur') ? 'Développeur' :
           text.includes('manager') ? 'Manager' : null,
    entreprise: 'Entreprise Actuelle',
    profil: 'Professionnel avec expérience en développement et gestion de projets.',
    adresse: { ville: 'Paris', pays: 'France' },
    linkedin: linkedinMatch ? `https://linkedin.com/in/${linkedinMatch[1]}` : null,
    github: githubMatch ? `https://github.com/${githubMatch[1]}` : null,
    competences: foundSkills.length > 0 ? foundSkills : ['JavaScript', 'React', 'Node.js'],
    metiers: ['Développement Logiciel'],
    soft_skills: ['Travail d\'équipe', 'Résolution de problèmes'],
    annees_experience: 5,
    niveau_experience: 'Senior',
    experiences: experiences,
    formations: [
      {
        diplome: 'Master en Informatique',
        etablissement: 'Université Paris',
        date_debut: '2015',
        date_fin: '2017'
      }
    ],
    langues: [{ langue: 'Français', niveau: 'Natif' }],
    confidence_score: 0.6, // Score de confiance plus réaliste
    metadata: {
      filename,
      extraction_date: new Date().toISOString(),
      parser: 'simulé',
      confidence: 0.6
    }
  };
}

// Fonction pour extraire le texte d'un buffer
async function extractTextFromBuffer(
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<string> {
  try {
    console.log(`Extraction texte - Fichier: ${filename}, Type: ${fileType}`);
    
    // PDF
    if (fileType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      return await extractTextFromPDF(buffer);
    }
    
    // DOCX
    if (fileType.includes('word') || filename.toLowerCase().endsWith('.docx')) {
      return await extractTextFromDOCX(buffer);
    }
    
    // TXT, RTF et autres fichiers texte
    if (fileType.includes('text') || 
        filename.toLowerCase().endsWith('.txt') || 
        filename.toLowerCase().endsWith('.rtf') ||
        filename.toLowerCase().endsWith('.md')) {
      return buffer.toString('utf-8');
    }
    
    // Pour les images (OCR futur)
    if (fileType.includes('image')) {
      throw new Error('Extraction d\'image non supportée actuellement. Veuillez convertir en PDF ou DOCX.');
    }
    
    // Fallback: essayer de décoder comme texte
    try {
      return buffer.toString('utf-8');
    } catch {
      throw new Error(`Format de fichier non supporté: ${fileType} (${filename})`);
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error(`Erreur extraction texte ${filename}:`, errorMessage);
    throw new Error(`Erreur d'extraction: ${errorMessage}`);
  }
}

// Fonction d'extraction PDF (à implémenter avec pdf-parse)
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Vérifier si pdf-parse est disponible
    let pdfParse;
    try {
      pdfParse = require('pdf-parse');
    } catch {
      console.warn('⚠️ pdf-parse non installé. Installation: npm install pdf-parse');
      return fallbackPDFText(buffer);
    }
    
    const pdfData = await pdfParse(buffer);
    console.log(`PDF extrait - Pages: ${pdfData.numpages}, Texte: ${pdfData.text.length} caractères`);
    
    return pdfData.text || '';
    
  } catch (error) {
    console.error('Erreur extraction PDF:', error);
    return fallbackPDFText(buffer);
  }
}

// Fallback pour PDF sans pdf-parse
function fallbackPDFText(buffer: Buffer): string {
  // Essayer de lire les 1000 premiers caractères comme texte brut
  const text = buffer.toString('utf-8', 0, 1000);
  const cleanText = text.replace(/[^\x20-\x7E]/g, ''); // Nettoyer les caractères non-ASCII
  return cleanText.length > 100 ? cleanText : '[PDF non parsable - Installez pdf.js]';
}


// Fonction d'extraction DOCX (à implémenter avec mammoth)
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    // Vérifier si mammoth est disponible
    let mammoth;
    try {
      mammoth = require('mammoth');
    } catch {
      console.warn('⚠️ mammoth non installé. Installation: npm install mammoth');
      return fallbackDOCXText(buffer);
    }
    
    const result = await mammoth.extractRawText({ buffer });
    console.log(`DOCX extrait - Texte: ${result.value.length} caractères`);
    
    return result.value || '';
    
  } catch (error) {
    console.error('Erreur extraction DOCX:', error);
    return fallbackDOCXText(buffer);
  }
}

// Fallback pour DOCX sans mammoth
function fallbackDOCXText(buffer: Buffer): string {
  console.warn('Utilisation du fallback DOCX');
  // Tentative basique d'extraction du texte
  try {
    // Les fichiers DOCX sont des archives ZIP, on pourrait essayer une extraction basique
    const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));
    
    // Chercher du texte dans le buffer
    const textMatch = text.match(/[A-Za-zÀ-ÿ0-9\s\.\-\(\)]{20,}/);
    if (textMatch) {
      return `[Fichier DOCX - Texte partiel extrait]
      ${textMatch[0].substring(0, 500)}...
      
      Pour une extraction complète, installez mammoth:
      npm install mammoth`;
    }
    
    return `[Fichier DOCX - Installez mammoth pour l'extraction]
    Buffer size: ${buffer.length} bytes
    Format DOCX détecté, mais mammoth n'est pas installé.`;
  } catch {
    return '[Fichier DOCX - Extraction impossible sans mammoth]';
  }
}

// Fonction utilitaire pour analyser le type de fichier
function detectFileType(buffer: Buffer, filename: string): string {
  // Vérifier par extension de fichier d'abord
  const ext = filename.toLowerCase().split('.').pop();
  
  const extensions: Record<string, string> = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'txt': 'text/plain',
    'rtf': 'application/rtf',
    'md': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html'
  };
  
  if (ext && extensions[ext]) {
    return extensions[ext];
  }
  
  // Vérifier par les premiers bytes (magic numbers)
  if (buffer.length >= 4) {
    const header = buffer.toString('hex', 0, 4);
    
    // PDF: %PDF
    if (header.startsWith('25504446')) return 'application/pdf';
    
    // DOCX: PK (ZIP archive)
    if (header.startsWith('504b0304')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    // DOC: D0 CF 11 E0 (Compound File Binary Format)
    if (header.startsWith('d0cf11e0')) return 'application/msword';
    
    // RTF: {\rtf
    if (header.startsWith('7b5c7274')) return 'application/rtf';
  }
  
  // Par défaut
  return 'application/octet-stream';
}



// Exporter les fonctions utilitaires si nécessaire
export {
  extractTextFromBuffer,
  extractTextFromPDF,
  extractTextFromDOCX,
  detectFileType
};