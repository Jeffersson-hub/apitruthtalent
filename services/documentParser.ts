// services/documentParser.ts
export interface ExtractedCVData {
  competences: string[];
  metiers: string[];
  experiences: any[];
  formations: any[];
  langues: any[];
  extraction_errors: string[];
}

// Interface pour le résultat complet
export interface ParseCVResult {
  candidat: {
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
  };
  confidence_score: number;
}

export const parseCV = async (
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<ParseCVResult> => {
  try {
    // 1. Extraire le texte selon le type de fichier
    const fileContent = await extractTextFromBuffer(buffer, filename, fileType);
    
    // 2. Appeler l'API DeepSeek (ou autre service)
    const extractedData = await callDeepSeekAPI(fileContent);
    
    // 3. Structurer la réponse
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
        langues: extractedData.langues || []
      },
      confidence_score: extractedData.confidence_score || 0.8
    };
    
  } catch (error) {
    console.error('Erreur parseCV:', error);
    
    // Retourner une structure vide en cas d'erreur
    return {
      candidat: {
        nom: '',
        prenom: '',
        email: '',
        competences: [],
        metiers: [],
        experiences: [],
        formations: [],
        langues: []
      },
      confidence_score: 0
    };
  }
};

// Fonction pour extraire le texte d'un buffer
async function extractTextFromBuffer(
  buffer: Buffer, 
  filename: string, 
  fileType: string
): Promise<string> {
  try {
    // PDF
    if (fileType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      return await extractTextFromPDF(buffer);
    }
    
    // DOCX
    if (fileType.includes('word') || filename.toLowerCase().endsWith('.docx')) {
      return await extractTextFromDOCX(buffer);
    }
    
    // TXT et autres
    return buffer.toString('utf-8');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    throw new Error(`Erreur d'extraction: ${errorMessage}`);
  }
}

// Version corrigée pour PDF avec gestion d'erreurs TypeScript
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Note: Vous devrez installer pdf-parse
    // npm install pdf-parse
    // npm install --save-dev @types/pdf-parse
    
    // Décommentez lorsque vous avez installé pdf-parse
    /*
    const pdf = require('pdf-parse');
    const pdfData = await pdf(buffer);
    return pdfData.text;
    */
    
    // Version temporaire pour développement
    return `[Contenu PDF simulé] 
    Nom: John Doe
    Email: john@example.com
    Poste: Développeur Full Stack
    Compétences: JavaScript, React, Node.js
    Expérience: 5 ans`;
    
  } catch (error) {
    // Correction TypeScript pour error.message
    if (error instanceof Error) {
      throw new Error(`Erreur d'extraction PDF: ${error.message}`);
    } else {
      throw new Error('Erreur d\'extraction PDF: Erreur inconnue');
    }
  }
}

// Version corrigée pour DOCX
async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    // Note: Vous devrez installer mammoth
    // npm install mammoth
    
    // Décommentez lorsque vous avez installé mammoth
    /*
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
    */
    
    // Version temporaire pour développement
    return `[Contenu DOCX simulé] 
    Prénom: Jane
    Nom: Smith
    Email: jane@example.com
    Poste: Product Manager
    Compétences: Agile, Scrum, Product Strategy`;
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Erreur d'extraction DOCX: ${error.message}`);
    } else {
      throw new Error('Erreur d\'extraction DOCX: Erreur inconnue');
    }
  }
}

// Fonction DeepSeek API corrigée
async function callDeepSeekAPI(cvText: string): Promise<any> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  
  if (!DEEPSEEK_API_KEY) {
    console.warn('⚠️ DEEPSEEK_API_KEY non configurée, utilisation du parser simulé');
    return simulateParsing(cvText);
  }
  
  try {
    const prompt = `Extrais les informations personnelles et professionnelles du CV suivant.
    
    Retourne un objet JSON avec:
    - nom (string)
    - prenom (string) 
    - email (string)
    - telephone (string optionnel)
    - poste (string optionnel)
    - entreprise (string optionnel)
    - competences (array)
    - metiers (array)
    - annees_experience (number optionnel)
    - experiences (array d'objets avec poste, entreprise, dates)
    - formations (array d'objets avec diplome, etablissement, date)
    - langues (array d'objets avec langue, niveau)
    - confidence_score (number entre 0 et 1)
    
    Texte CV: ${cvText.substring(0, 5000)}`;
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
      })
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    const result = await response.json();
    const content = result.choices[0].message.content;
    
    // Nettoyer la réponse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return simulateParsing(cvText);
    
  } catch (error) {
    console.error('Erreur DeepSeek API:', error);
    return simulateParsing(cvText);
  }
}

// Parser simulé pour le développement
function simulateParsing(cvText: string): any {
  // Logique de parsing simple basée sur des mots-clés
  const text = cvText.toLowerCase();
  
  return {
    nom: 'Doe',
    prenom: text.includes('john') ? 'John' : text.includes('jane') ? 'Jane' : 'Candidat',
    email: 'candidat@example.com',
    competences: ['JavaScript', 'React', 'Node.js', 'TypeScript'],
    metiers: ['Développeur', 'Ingénieur Logiciel'],
    annees_experience: 5,
    experiences: [
      {
        poste: 'Développeur Full Stack',
        entreprise: 'Tech Company',
        date_debut: '2020-01-01',
        date_fin: '2023-12-31'
      }
    ],
    formations: [
      {
        diplome: 'Master Informatique',
        etablissement: 'Université',
        date_obtention: '2019'
      }
    ],
    confidence_score: 0.7
  };
}