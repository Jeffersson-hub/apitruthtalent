// types/candidats.ts
export interface Experience {
  periode: string;
  poste: string;
  entreprise: string;
  description?: string;
}

export interface Formation {
  periode: string;
  diplome: string;
  etablissement: string;
  description?: string;
}

export interface Langue {
  langue: string;
  niveau?: string;
}

export interface Adresse {
  rue?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  complete?: string;
}

export default interface Candidat {
  id?: string;
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
  adresse: string | Adresse | null;
  niveau: string | null;
  linkedin: string | null;
  fichier: string | null;
  cv_filename: string | null;
  confidence_score?: number;
  file_type?: string;
  extraction_date?: string;
  date_extraction?: string;
  extraction_details?: {
    adresse: { found: boolean; confidence: number };
    experiences: { count: number; confidence: number };
    formations: { count: number; confidence: number };
  };
}