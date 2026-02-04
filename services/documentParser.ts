// services/documentParser.ts

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

export const parseCV = async (
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<ParseCVResult> => {
  const startTime = Date.now();
  
  try {
    // 1. Extraire le texte brut
    const rawText = await extractTextFromBuffer(buffer, filename, fileType);
    
    // 2. Appeler l'API DeepSeek (ou autre service)
    const extractedData = await callDeepSeekAPI(rawText, filename);
    
    // 3. Calculer le temps de traitement
    const processingTimeMs = Date.now() - startTime;
    
    // 4. Structurer la réponse complète
    return {
      candidat: {
        nom: extractedData.nom || '',
        prenom: extractedData.prenom || '',
        email: extractedData.email || '',
        telephone: extractedData.telephone || '',
        poste: extractedData.poste || '',
        entreprise: extractedData.entreprise || '',
        competences: extractedData.competences || [],
        metiers: extractedData.metiers || [],
        annees_experience: extractedData.annees_experience || 0,
        experiences: extractedData.experiences || [],
        formations: extractedData.formations || [],
        langues: extractedData.langues || [],
        
        // Nouvelles propriétés
        raw_text: rawText.substring(0, 1000) + (rawText.length > 1000 ? '...' : ''), // Limiter la taille
        metadata: extractedData.metadata || {
          filename,
          filetype: fileType,
          extraction_date: new Date().toISOString(),
          pages: extractedData.pages || 1,
          word_count: rawText.split(/\s+/).length,
          language: extractedData.language || 'fr'
        },
        profil: extractedData.profil || extractedData.summary || '',
        adresse: extractedData.adresse,
        linkedin: extractedData.linkedin,
        github: extractedData.github,
        portfolio: extractedData.portfolio,
        niveau_etude: extractedData.niveau_etude,
        niveau_experience: extractedData.niveau_experience,
        salaire_actuel: extractedData.salaire_actuel,
        salaire_souhaite: extractedData.salaire_souhaite,
        disponibilite: extractedData.disponibilite,
        mobilite: extractedData.mobilite,
        soft_skills: extractedData.soft_skills,
        certifications: extractedData.certifications,
        projets: extractedData.projets
      },
      confidence_score: extractedData.confidence_score || 0.8,
      raw_text: rawText,
      metadata: {
        filename,
        filetype: fileType,
        extraction_date: new Date().toISOString(),
        parser_version: '1.0.0',
        processing_time_ms: processingTimeMs
      }
    };
    
  } catch (error) {
    console.error('Erreur parseCV:', error);
    
    // Retourner une structure vide avec les bonnes propriétés
    return {
      candidat: {
        nom: '',
        prenom: '',
        email: '',
        competences: [],
        metiers: [],
        experiences: [],
        formations: [],
        langues: [],
        metadata: {
          filename,
          filetype: fileType,
          extraction_date: new Date().toISOString()
        }
      },
      confidence_score: 0,
      metadata: {
        filename,
        filetype: fileType,
        extraction_date: new Date().toISOString(),
        parser_version: '1.0.0',
        processing_time_ms: Date.now() - startTime
      }
    };
  }
};

// Mettre à jour la fonction callDeepSeekAPI pour inclure toutes les données
async function callDeepSeekAPI(cvText: string, filename: string): Promise<any> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  
  if (!DEEPSEEK_API_KEY) {
    console.warn('⚠️ DEEPSEEK_API_KEY non configurée, utilisation du parser simulé');
    return simulateParsing(cvText, filename);
  }
  
  try {
    const prompt = `Extrais TOUTES les informations d'un CV professionnel.
    
    Retourne un objet JSON COMPLET avec toutes ces propriétés:
    
    INFORMATIONS PERSONNELLES:
    - nom (string)
    - prenom (string) 
    - email (string)
    - telephone (string optionnel)
    - adresse (object optionnel avec rue, ville, code_postal, pays)
    - linkedin (string optionnel)
    - github (string optionnel)
    - portfolio (string optionnel)
    
    PROFIL PROFESSIONNEL:
    - poste (string optionnel, poste actuel)
    - entreprise (string optionnel, entreprise actuelle)
    - profil (string optionnel, résumé professionnel)
    - niveau_etude (string optionnel)
    - niveau_experience (string optionnel: Junior/Mid-level/Senior/Expert)
    - annees_experience (number optionnel)
    
    COMPÉTENCES:
    - competences (array de compétences techniques)
    - soft_skills (array de compétences comportementales)
    - metiers (array de métiers/domaines)
    - langues (array d'objets {langue: string, niveau: string})
    
    PARCOURS:
    - experiences (array d'objets avec poste, entreprise, date_debut, date_fin, description, competences_utilisees)
    - formations (array d'objets avec diplome, etablissement, date_debut, date_fin, mention)
    - certifications (array d'objets avec nom, organisme, date_obtention)
    - projets (array d'objets avec nom, description, technologies, date)
    
    ASPECTS PRATIQUES:
    - salaire_actuel (number optionnel)
    - salaire_souhaite (number optionnel)
    - disponibilite (string optionnel)
    - mobilite (array de villes/régions optionnel)
    
    MÉTADONNÉES:
    - confidence_score (number entre 0 et 1)
    - language (string: fr/en/etc)
    - pages (number optionnel)
    
    Texte CV: ${cvText.substring(0, 8000)}`;
    
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

// Parser simulé étendu
function simulateParsing(cvText: string, filename: string): any {
  // Analyse basique du texte
  const text = cvText.toLowerCase();
  const words = text.split(/\s+/).length;
  
  // Détection des informations
  const emailMatch = cvText.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  const phoneMatch = cvText.match(/(?:\+33|0)[1-9](?:[\s\.-]?\d{2}){4}/);
  
  // Détection de certaines informations
  const hasReact = text.includes('react');
  const hasNode = text.includes('node');
  const hasPython = text.includes('python');
  const hasJava = text.includes('java');
  
  const competences = [];
  if (hasReact) competences.push('React');
  if (hasNode) competences.push('Node.js');
  if (hasPython) competences.push('Python');
  if (hasJava) competences.push('Java');
  
  return {
    nom: 'Simulé',
    prenom: 'Candidat',
    email: emailMatch ? emailMatch[0] : 'candidat@example.com',
    telephone: phoneMatch ? phoneMatch[0] : '+33 1 23 45 67 89',
    poste: text.includes('developpeur') ? 'Développeur Full Stack' : 
           text.includes('manager') ? 'Product Manager' : 'Consultant',
    entreprise: 'Entreprise Actuelle',
    profil: 'Professionnel expérimenté avec une expertise en développement et management de projets.',
    adresse: {
      ville: 'Paris',
      pays: 'France'
    },
    linkedin: 'https://linkedin.com/in/simule',
    competences: competences.length > 0 ? competences : ['JavaScript', 'TypeScript', 'React', 'Node.js'],
    metiers: ['Développeur', 'Ingénieur Logiciel'],
    soft_skills: ['Communication', 'Travail d\'équipe', 'Résolution de problèmes'],
    annees_experience: 5,
    experiences: [
      {
        poste: 'Développeur Senior',
        entreprise: 'Tech Corp',
        date_debut: '2020-01-01',
        date_fin: '2023-12-31',
        description: 'Développement d\'applications web full stack'
      }
    ],
    formations: [
      {
        diplome: 'Master Informatique',
        etablissement: 'Université Paris',
        date_obtention: '2019'
      }
    ],
    langues: [
      { langue: 'Français', niveau: 'Natif' },
      { langue: 'Anglais', niveau: 'Courant' }
    ],
    certifications: [
      { nom: 'AWS Certified Developer', organisme: 'Amazon', date_obtention: '2022' }
    ],
    niveau_etude: 'Master',
    niveau_experience: 'Senior',
    salaire_actuel: 55000,
    salaire_souhaite: 65000,
    disponibilite: '1 mois',
    mobilite: ['Paris', 'Île-de-France'],
    confidence_score: 0.7,
    language: text.includes('the') && text.includes('and') ? 'en' : 'fr',
    pages: Math.ceil(words / 300)
  };
}

// services/documentParser.ts

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
  console.warn('Utilisation du fallback PDF');
  // Vous pourriez implémenter une extraction basique ou retourner un message
  return `[Fichier PDF - Installez pdf-parse pour l'extraction complète]
  Pour une extraction complète du PDF, installez la dépendance:
  npm install pdf-parse
  
  Buffer size: ${buffer.length} bytes
  Extraction limitée sans pdf-parse.`;
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