import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialiser Supabase avec TES clés
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ==================== TYPES ====================
interface Experience {
  entreprise: string;
  poste: string;
  duree: string;
  dates: { start: string | null; end: string | null };
  duree_mois: number;
  responsabilites: string[];
  competences: string[];
}

interface Formation {
  diplome: string;
  ecole: string;
  annee: string | null;
  ville: string | null;
}

interface Langue {
  langue: string;
  niveau: string;
}

interface Skills {
  technical: string[];
  soft: string[];
  tools: string[];
  languages: Langue[];
  all: string[];
}

interface ParsedCV {
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  fullName: string;
  skills: Skills;
  experiences: Experience[];
  education: Formation[];
  metier: string;
  niveau: string;
  annees_experience: number;
  postes: string[];
  profil: string;
  confidence: number;
}

// ==================== FONCTIONS D'EXTRACTION ====================
class CVExtractor {
  
  parseText(text: string): ParsedCV {
    // 1. Extraire contact
    const contact = this.extractContact(text);
    
    // 2. Extraire compétences
    const skills = this.extractSkills(text);
    
    // 3. Extraire expériences
    const experiences = this.extractExperiences(text);
    
    // 4. Extraire formations
    const education = this.extractEducation(text);
    
    // 5. Analyser métadonnées
    const metadata = this.analyzeMetadata(text, experiences);
    
    return {
      ...contact,
      skills,
      experiences,
      education,
      ...metadata,
      confidence: this.calculateConfidence(contact, experiences, skills)
    };
  }
  
  private extractContact(text: string): {
    nom: string;
    prenom: string;
    email: string | null;
    telephone: string | null;
    adresse: string | null;
    fullName: string;
  } {
    // Nom et prénom (première ligne significative)
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    let fullName = '';
    
    for (const line of lines.slice(0, 5)) {
      if (!line.includes('@') && !line.match(/\d{10}/) && line.length > 5) {
        fullName = line;
        break;
      }
    }
    
    const parts = fullName.split(' ');
    const prenom = parts[0] || 'Candidat';
    const nom = parts.slice(1).join(' ') || 'Inconnu';
    
    // Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0].toLowerCase() : null;
    
    // Téléphone
    const phoneMatch = text.match(/(?:(?:\+|00)33|0)[1-9](?:[\s.-]?\d{2}){4}/);
    const telephone = phoneMatch ? phoneMatch[0] : null;
    
    // Adresse
    const addressMatch = text.match(/\d{5}\s+[A-Za-zÀ-ÿ\s-]+/);
    const adresse = addressMatch ? addressMatch[0] : null;
    
    return {
      nom,
      prenom,
      fullName: fullName || `${prenom} ${nom}`,
      email,
      telephone,
      adresse
    };
  }
  
  private extractSkills(text: string): Skills {
    const skills: Skills = {
      technical: [],
      soft: [],
      tools: [],
      languages: [],
      all: []
    };
    
    const textLower = text.toLowerCase();
    
    // Chercher section COMPÉTENCES
    const competencesIndex = textLower.indexOf('compétences');
    const skillsIndex = textLower.indexOf('skills');
    const index = Math.max(competencesIndex, skillsIndex);
    
    if (index !== -1) {
      const sectionText = text.substring(index, Math.min(index + 2000, text.length));
      const lines = sectionText.split('\n');
      
      for (let i = 1; i < Math.min(lines.length, 30); i++) {
        const line = lines[i].trim();
        
        // Arrêter si nouvelle section
        if (line.match(/^(expérience|formation|langues|projets|contact)/i)) {
          break;
        }
        
        // Extraire les compétences avec puces
        if (line && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))) {
          const skill = line.replace(/^[-•*]\s*/, '').trim();
          if (skill && skill.length > 2) {
            skills.all.push(skill);
            
            // Catégoriser
            const skillLower = skill.toLowerCase();
            if (skillLower.match(/javascript|python|java|sql|react|vue|angular|node|docker|aws|git/)) {
              skills.technical.push(skill);
            } else if (skillLower.match(/excel|word|powerpoint|photoshop|figma|canva|jira|slack/)) {
              skills.tools.push(skill);
            } else if (skillLower.match(/communication|leadership|teamwork|gestion|organisation|adaptabilité/)) {
              skills.soft.push(skill);
            }
          }
        }
      }
    }
    
    // Extraire langues
    const languesIndex = textLower.indexOf('langues');
    if (languesIndex !== -1) {
      const languesText = text.substring(languesIndex, Math.min(languesIndex + 500, text.length));
      const lines = languesText.split('\n');
      
      for (let i = 1; i < Math.min(lines.length, 10); i++) {
        const line = lines[i].trim();
        if (line && (line.startsWith('-') || line.includes(':'))) {
          const match = line.match(/([A-Za-zÀ-ÿ]+)[:\-]?\s*(.+)/);
          if (match) {
            skills.languages.push({
              langue: match[1].trim(),
              niveau: match[2].trim()
            });
          }
        }
      }
    }
    
    return skills;
  }
  
  private extractExperiences(text: string): Experience[] {
    const experiences: Experience[] = [];
    const lines = text.split('\n');
    
    // Chercher section EXPÉRIENCE
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('expérience')) {
        startIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return experiences;
    
    let currentExp: Partial<Experience> = {};
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Arrêter à nouvelle section
      if (line.match(/^(formation|compétences|langues|projets)/i)) {
        if (currentExp.poste && currentExp.entreprise) {
          experiences.push(currentExp as Experience);
        }
        break;
      }
      
      // Détecter nouvelle expérience (ligne avec dates)
      if (line.match(/\d{4}/) && line.length > 10) {
        // Sauvegarder l'expérience précédente
        if (currentExp.poste && currentExp.entreprise) {
          experiences.push(currentExp as Experience);
        }
        
        // Nouvelle expérience
        currentExp = this.parseExperienceLine(line);
      } 
      // Lignes de description
      else if (line && (line.startsWith('-') || line.startsWith('•'))) {
        if (!currentExp.responsabilites) {
          currentExp.responsabilites = [];
        }
        currentExp.responsabilites.push(line.replace(/^[-•*]\s*/, ''));
      }
    }
    
    // Ajouter la dernière expérience
    if (currentExp.poste && currentExp.entreprise) {
      experiences.push(currentExp as Experience);
    }
    
    return experiences;
  }
  
  private parseExperienceLine(line: string): Partial<Experience> {
    // Extraire dates
    const dateMatch = line.match(/(\d{4})(?:\s*[-–]\s*(\d{4}|présent))?/);
    const startYear = dateMatch ? dateMatch[1] : null;
    const endYear = dateMatch ? (dateMatch[2] || null) : null;
    const enCours = endYear === 'présent';
    
    // Calculer durée
    let duree_mois = 0;
    if (startYear && endYear && !enCours) {
      duree_mois = (parseInt(endYear) - parseInt(startYear) + 1) * 12;
    } else if (startYear) {
      duree_mois = 12;
    }
    
    // Extraire poste et entreprise
    let poste = '';
    let entreprise = '';
    
    // Nettoyer la ligne
    let cleanLine = line.replace(/\d{4}.*?(?=\s|$)/, '').trim();
    
    // Chercher "chez" ou "à"
    const chezMatch = cleanLine.match(/(.+?)\s+chez\s+(.+)/i);
    const aMatch = cleanLine.match(/(.+?)\s+à\s+(.+)/i);
    
    if (chezMatch) {
      poste = chezMatch[1].trim();
      entreprise = chezMatch[2].trim();
    } else if (aMatch) {
      poste = aMatch[1].trim();
      entreprise = aMatch[2].trim();
    } else {
      // Premiers mots comme poste, reste comme entreprise
      const words = cleanLine.split(' ');
      if (words.length > 1) {
        poste = words[0] + ' ' + (words[1] || '');
        entreprise = words.slice(2).join(' ') || 'Entreprise non spécifiée';
      } else {
        poste = cleanLine;
        entreprise = 'Entreprise non spécifiée';
      }
    }
    
    return {
      entreprise,
      poste,
      duree: `${startYear || ''}${endYear ? `-${endYear}` : ''}`,
      dates: {
        start: startYear ? `${startYear}-01-01` : null,
        end: endYear && !enCours ? `${endYear}-12-31` : null
      },
      duree_mois,
      responsabilites: [],
      competences: []
    };
  }
  
  private extractEducation(text: string): Formation[] {
    const formations: Formation[] = [];
    const lines = text.split('\n');
    
    // Chercher section FORMATION
    let startIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('formation')) {
        startIndex = i;
        break;
      }
    }
    
    if (startIndex === -1) return formations;
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Arrêter à nouvelle section
      if (line.match(/^(expérience|compétences|langues|projets)/i)) {
        break;
      }
      
      if (line && (line.match(/\d{4}/) || line.match(/(bac|bts|licence|master)/i))) {
        const formation = this.parseFormationLine(line);
        if (formation) {
          formations.push(formation);
        }
      }
    }
    
    return formations;
  }
  
  private parseFormationLine(line: string): Formation | null {
    // Extraire année
    const yearMatch = line.match(/(\d{4})/);
    const annee = yearMatch ? yearMatch[1] : null;
    
    // Chercher diplôme
    let diplome = '';
    const diplomeMatch = line.match(/(bac|bts|dut|licence|master|doctorat)/i);
    if (diplomeMatch) {
      diplome = diplomeMatch[1].charAt(0).toUpperCase() + diplomeMatch[1].slice(1).toLowerCase();
    }
    
    // École (reste de la ligne)
    let ecole = line
      .replace(/(\d{4})/g, '')
      .replace(/(bac|bts|dut|licence|master|doctorat)/gi, '')
      .replace(/[^\w\sÀ-ÿ-]/g, ' ')
      .trim();
    
    // Ville entre parenthèses
    let ville = null;
    const villeMatch = line.match(/\(([^)]+)\)/);
    if (villeMatch) {
      ville = villeMatch[1];
      ecole = ecole.replace(/\([^)]+\)/, '').trim();
    }
    
    if (!diplome && !ecole) return null;
    
    return {
      diplome: diplome || 'Diplôme',
      ecole: ecole || 'Établissement non spécifié',
      annee,
      ville
    };
  }
  
  private analyzeMetadata(text: string, experiences: Experience[]): {
    metier: string;
    niveau: string;
    annees_experience: number;
    postes: string[];
    profil: string;
  } {
    // Calculer années d'expérience
    const totalMonths = experiences.reduce((sum, exp) => sum + exp.duree_mois, 0);
    const annees_experience = Math.round((totalMonths / 12) * 10) / 10;
    
    // Déterminer niveau
    let niveau = 'Junior';
    if (annees_experience >= 10) niveau = 'Expert';
    else if (annees_experience >= 5) niveau = 'Senior';
    else if (annees_experience >= 2) niveau = 'Confirmé';
    
    // Détecter métier principal
    const metier = this.detectMetier(text, experiences);
    
    // Liste des postes
    const postes = experiences.map(exp => exp.poste).filter(p => p);
    
    // Profil
    const profil = `${niveau} ${metier} avec ${annees_experience} ans d'expérience`;
    
    return {
      metier,
      niveau,
      annees_experience,
      postes,
      profil
    };
  }
  
  private detectMetier(text: string, experiences: Experience[]): string {
    const textLower = text.toLowerCase();
    
    const metiers = [
      { nom: 'Développeur', keywords: ['développeur', 'developer', 'dev', 'programmeur'] },
      { nom: 'Commercial', keywords: ['commercial', 'vente', 'vendeur', 'sales'] },
      { nom: 'Marketing', keywords: ['marketing', 'communication', 'brand'] },
      { nom: 'Gestionnaire', keywords: ['gestionnaire', 'administratif', 'back office', 'gestion'] },
      { nom: 'Chef de projet', keywords: ['chef de projet', 'project manager', 'chargé de projet'] },
      { nom: 'Consultant', keywords: ['consultant', 'conseil', 'advisor'] },
      { nom: 'Analyste', keywords: ['analyste', 'analyst', 'data'] },
      { nom: 'Designer', keywords: ['designer', 'graphiste', 'ui', 'ux'] },
      { nom: 'RH', keywords: ['rh', 'ressources humaines', 'recruteur'] },
      { nom: 'Finance', keywords: ['finance', 'comptable', 'audit', 'contrôleur'] }
    ];
    
    // Chercher dans le texte
    for (const metier of metiers) {
      if (metier.keywords.some(keyword => textLower.includes(keyword))) {
        return metier.nom;
      }
    }
    
    // Chercher dans les postes
    for (const exp of experiences) {
      const posteLower = exp.poste.toLowerCase();
      for (const metier of metiers) {
        if (metier.keywords.some(keyword => posteLower.includes(keyword))) {
          return metier.nom;
        }
      }
    }
    
    return 'Non spécifié';
  }
  
  private calculateConfidence(contact: any, experiences: Experience[], skills: Skills): number {
    let score = 0;
    
    // Contact (40 points)
    if (contact.email) score += 20;
    if (contact.telephone) score += 15;
    if (contact.nom && contact.prenom) score += 5;
    
    // Expériences (40 points)
    if (experiences.length > 0) {
      score += Math.min(experiences.length * 10, 30);
      const totalMonths = experiences.reduce((sum, exp) => sum + exp.duree_mois, 0);
      if (totalMonths > 0) score += 10;
    }
    
    // Compétences (20 points)
    if (skills.all.length > 0) {
      score += Math.min(skills.all.length * 2, 15);
      if (skills.languages.length > 0) score += 5;
    }
    
    return Math.min(score / 100, 1);
  }
}

// ==================== API HANDLER ====================
const extractor = new CVExtractor();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  
  try {
    const { text, filename = 'cv.txt' } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Le texte du CV est requis'
      });
    }
    
    console.log(`🎯 Parsing CV: ${filename} (${text.length} caractères)`);
    
    // Parser le CV
    const result = extractor.parseText(text);
    
    // Générer un ID unique
    const fileHash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
    const fichier = `cv_${fileHash}`;
    
    // Préparer données pour Supabase
    const dbData = {
      nom: result.nom,
      prenom: result.prenom,
      email: result.email,
      telephone: result.telephone,
      adresse: result.adresse,
      competences: result.skills.all,
      experiences: result.experiences,
      formations: result.education,
      langues: result.skills.languages,
      metiers: result.metier,
      niveau: result.niveau,
      annees_experience: result.annees_experience,
      postes: result.postes,
      profil: result.profil,
      fichier,
      cv_filename: filename,
      raw_text: text.substring(0, 10000),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'analysé',
      date_analyse: new Date().toISOString(),
      confidence_score: result.confidence
    };
    
    // Sauvegarder dans Supabase
    const { data: savedData, error } = await supabase
      .from('candidats')
      .upsert(dbData, { onConflict: 'fichier' })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erreur Supabase:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        parsed_data: result
      });
    }
    
    console.log(`✅ CV sauvegardé: ${savedData.id}`);
    
    return res.status(200).json({
      success: true,
      candidat_id: savedData.id,
      data: result,
      message: 'CV analysé avec succès'
    });
    
  } catch (error: any) {
    console.error('❌ Erreur API:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}