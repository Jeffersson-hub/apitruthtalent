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

export interface Candidat {
  // Champs obligatoires
  id?: number;
  fichier: string;
  cv_filename: string;
  confidence_score: number;
  file_type: string;
  extraction_date: string;
  date_extraction: string;
  
  // Informations personnelles
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  
  // Profil professionnel
  poste: string | null;
  entreprise: string | null;
  profil: string | null;
  
  // Nouveau champ niveau
  niveau: string | null; // <-- Ajouté ici
  
  niveau_etude?: string | null;
  niveau_experience?: string | null;
  annees_experience?: number | null;
  
  // Compétences
  competences: string[];
  metiers: string[];
  soft_skills?: string[];
  
  // Parcours
  experiences: any[];
  formations: any[];
  certifications?: any[];
  projets?: any[];
  langues: any[];
  
  // Contact supplémentaires
  linkedin: string | null;
  github?: string | null;
  portfolio?: string | null;
  
  // Adresse - CORRECTION ICI : soit un objet, soit null, soit string
  adresse: {
    rue?: string;
    ville?: string;
    code_postal?: string;
    pays?: string;
  } | string | null;
  
  // Aspects pratiques
  salaire_actuel?: number | null;
  salaire_souhaite?: number | null;
  disponibilite?: string | null;
  mobilite?: string[] | null;
  
  // Métadonnées
  metadata?: any;
  raw_text?: string | null;
  
  // Statut
  status?: string;
  created_at?: string;
  updated_at?: string;

  cv_url?: string; // Ajoutez ce champ
  postes?: string[]; // Ajoutez ce champ si utilisé
  date_analyse?: string;
  source_analyse?: string;
  affinda_doc_id?: string;
}

export default Candidat;