// types/candidats.ts
export interface Experience {
  entreprise: string;
  poste: string;
  debut: string;
  fin: string | null;
  description?: string | null;
}

export interface Formation {
  etablissement: string;
  diplome: string;
  date_obtention: string;
  domaine?: string | null;
}

export interface Langue {
  langue: string;
  niveau: string;
  certification?: boolean;
}

interface Candidat {
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
  experiences: Experience[];
  formations: Formation[];
  langues: Langue[];
  adresse: string | null;
  linkedin: string | null;
  niveau: string | null;
  
  // Champs optionnels
  confidence_score?: number;
  annees_experience?: number;
  cv_filename?: string;
  file_type?: string;
  raw_text?: string;
  date_analyse?: string;
  statut?: string;
  source?: string;
  offre_postulee?: string | null;
  [key: string]: any; // Pour les champs dynamiques
}

export default Candidat;