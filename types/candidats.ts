// types/candidats.ts

// 1. Définir les interfaces avec les bonnes propriétés
export interface Experience {
  entreprise: string;
  poste: string;
  debut: string | null;  // ← CORRECTION: propriété "debut" (pas "date_debut")
  fin: string | null;    // ← CORRECTION: propriété "fin" (pas "date_fin")
  description?: string | null;
  lieu?: string;
  [key: string]: any;
}

export interface Formation {
  etablissement: string;
  diplome: string;
  date_obtention: string;
  domaine?: string;
  [key: string]: any;
}

export interface Langue {
  langue: string;
  niveau: string;
  certification?: boolean;
  [key: string]: any;
}

// 2. Interface Candidat
export default interface Candidat {
  // Champs obligatoires
  fichier: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  entreprise: string | null;
  profil: string | null;
  competences: string[];
  metiers: string[];
  experiences: Experience[]; // ✅ Tableau d'objets Experience
  formations: Formation[];   // ✅ Tableau d'objets Formation
  langues: Langue[];         // ✅ Tableau d'objets Langue
  adresse: string | null;
  linkedin: string | null;
  niveau: string | null;
  confidence_score?: number;
  
  // Champs optionnels
  annees_experience?: number;
  id?: string;
  statut?: string;
  date_extraction?: string;
  cv_url?: string;
  postes?: string[];
  date_analyse?: string;
  source_analyse?: string;
  affinda_doc_id?: string;
  raw_text?: string;
  extraction_date?: string;
  file_type?: string;
  links?: string[];
  created_at?: string;
  updated_at?: string;
  cv_filename?: string | null;
}