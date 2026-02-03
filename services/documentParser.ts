// services/documentParser.ts
// services/documentParser.ts
import type Candidat from '../types/candidats';
import type { Experience, Formation, Langue } from '../types/candidats';

// Interface pour le résultat du parsing
interface ParseResult {
  candidat: Candidat;
  confidence_score: number;
  raw_text?: string;
  metadata?: Record<string, any>;
}

export async function parseCV(
  buffer: Buffer,
  filename: string,
  fileType: string
): Promise<ParseResult> {
  
  // 1. Extraire le texte brut du CV
  const rawText = await extractTextFromBuffer(buffer, fileType);
  
  // 2. Analyser le texte pour en extraire les informations
  const extractedData = await analyzeCVText(rawText);
  
  // 3. Structurer les données selon votre interface Candidat
  const candidat: Candidat = {
    // Champs obligatoires
    fichier: filename,
    nom: extractedData.nom || null,
    prenom: extractedData.prenom || null,
    email: extractedData.email || null,
    telephone: extractedData.telephone || null,
    poste: extractedData.poste || null,
    entreprise: extractedData.entrepriseActuelle || null,
    profil: extractedData.profil || null,
    
    // Tableaux - conversions depuis les données extraites
    competences: extractedData.competences || [],
    metiers: extractedData.metiers || [],
    
    // Expériences professionnelles (convertir depuis données brutes)
    experiences: extractedData.experiences?.map((exp: { company: any; employer: any; entreprise: any; title: any; position: any; poste: any; startDate: string | number | Date; endDate: string | number | Date; description: any; resume: any; location: any; lieu: any; }) => ({
      entreprise: exp.company || exp.employer || exp.entreprise || "Inconnu",
      poste: exp.title || exp.position || exp.poste || "Non spécifié",
      debut: exp.startDate ? new Date(exp.startDate).toISOString() : null,
      fin: exp.endDate ? new Date(exp.endDate).toISOString() : null,
      description: exp.description || exp.resume || null,
      lieu: exp.location || exp.lieu || null
    })) || [],
    
    // Formations
    formations: extractedData.education?.map((edu: { institution: any; school: any; etablissement: any; degree: any; diploma: any; diplome: any; date: string | number | Date; field: any; domain: any; domaine: any; }) => ({
      etablissement: edu.institution || edu.school || edu.etablissement || "Inconnu",
      diplome: edu.degree || edu.diploma || edu.diplome || "Non spécifié",
      date_obtention: edu.date ? new Date(edu.date).toISOString() : new Date().toISOString(),
      domaine: edu.field || edu.domain || edu.domaine || null
    })) || [],
    
    // Langues
    langues: extractedData.languages?.map((lang: { language: any; langue: any; level: any; niveau: any; certified: any; }) => ({
      langue: lang.language || lang.langue || "Inconnu",
      niveau: lang.level || lang.niveau || "Non spécifié",
      certification: lang.certified || false
    })) || [],
    
    // Autres informations
    adresse: extractedData.address || extractedData.location || null,
    linkedin: extractedData.linkedin || extractedData.social?.linkedin || null,
    niveau: extractedData.seniority || extractedData.experienceLevel || null,
    
    // Métadonnées et score de confiance
    confidence_score: extractedData.confidenceScore || 0.7,
    cv_filename: filename,
    file_type: fileType,
    raw_text: rawText.substring(0, 5000), // Stocker les premiers 5000 caractères
    extraction_date: new Date().toISOString(),
    date_extraction: new Date().toISOString(),
    
    // Champs optionnels calculés
    annees_experience: calculateYearsOfExperience(extractedData.experiences)
  };
  
  // 4. Calculer le score de confiance global
  const confidenceScore = calculateConfidenceScore(candidat);
  
  return {
    candidat,
    confidence_score: confidenceScore,
    raw_text: rawText,
    metadata: {
      filename,
      file_type: fileType,
      extraction_date: new Date().toISOString(),
      file_size: buffer.length,
      parsing_strategy: 'basic_text_analysis'
    }
  };
}

// Fonction pour extraire le texte selon le type de fichier
async function extractTextFromBuffer(buffer: Buffer, fileType: string): Promise<string> {
  try {
    if (fileType === 'application/pdf') {
      // Utiliser pdf-parse ou une librairie similaire
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      return data.text;
    } else if (
      fileType.includes('msword') || 
      fileType.includes('wordprocessingml')
    ) {
      // Utiliser mammoth ou une librairie pour DOC/DOCX
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (fileType === 'text/plain') {
      // Pour les fichiers texte
      return buffer.toString('utf-8');
    } else {
      // Fallback: essayer de lire comme texte
      return buffer.toString('utf-8');
    }
  } catch (error) {
    console.error('Erreur lors de l\'extraction du texte:', error);
    return buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));
  }
}

// Fonction pour analyser le texte du CV
async function analyzeCVText(text: string): Promise<any> {
  // ICI : Implémentez votre logique d'analyse
  
  // Exemple simplifié :
  const data: any = {
    competences: [],
    experiences: [],
    formations: [],
    languages: []
  };
  
  // 1. Trouver email (regex simple)
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) data.email = emailMatch[0];
  
  // 2. Trouver téléphone (regex pour numéros FR)
  const phoneMatch = text.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);
  if (phoneMatch) data.telephone = phoneMatch[0];
  
  // 3. Extraire sections (expérience, formation, compétences)
  // ... votre logique d'extraction ici ...
  
  return data;
}

// Calculer les années d'expérience
function calculateYearsOfExperience(experiences: any[]): number {
  if (!experiences || experiences.length === 0) return 0;
  
  let totalYears = 0;
  experiences.forEach(exp => {
    if (exp.startDate && exp.endDate) {
      const start = new Date(exp.startDate);
      const end = new Date(exp.endDate);
      const years = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      totalYears += Math.max(0, years);
    }
  });
  
  return Math.round(totalYears * 10) / 10; // Arrondir à 1 décimale
}

// Calculer le score de confiance
function calculateConfidenceScore(candidat: Candidat): number {
  let score = 0;
  let totalPoints = 0;
  
  // Nom + Prénom : 20 points
  if (candidat.nom && candidat.prenom) score += 20;
  totalPoints += 20;
  
  // Email : 15 points
  if (candidat.email) score += 15;
  totalPoints += 15;
  
  // Téléphone : 10 points
  if (candidat.telephone) score += 10;
  totalPoints += 10;
  
  // Poste actuel : 15 points
  if (candidat.poste) score += 15;
  totalPoints += 15;
  
  // Expériences : 20 points (au moins une expérience)
  if (candidat.experiences && candidat.experiences.length > 0) score += 20;
  totalPoints += 20;
  
  // Compétences : 10 points (au moins 3 compétences)
  if (candidat.competences && candidat.competences.length >= 3) score += 10;
  totalPoints += 10;
  
  // Formations : 10 points (au moins une formation)
  if (candidat.formations && candidat.formations.length > 0) score += 10;
  totalPoints += 10;
  
  return totalPoints > 0 ? Math.round((score / totalPoints) * 100) / 100 : 0;
}