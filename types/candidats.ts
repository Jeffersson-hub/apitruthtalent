// types/candidats.ts
export interface Experience {
  debut: string | null;
  fin: string | null;
  poste: string | null;
  entreprise: string | null;
  description: string;
}

export interface Formation {
  intitule: string | null;
  ecole: string | null;
  diplome?: string | null; // Rendre diplome optionnel
  raw: string;
}

export interface Langue {
  langue: string;
  niveau: string;
}

export interface Candidat {
  fichier: string | null;
  nom: string | null;
  prenom: string | null;
  profil: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  linkedin: string | null;
  postes: string[];
  entreprise: string | null;
  competences: string[];
  experiences: Experience[];
  formations: Formation[];
  langues: Langue[];
  metiers: string[];
  niveau: string | null;
  // CHAMPS OPTIONNELS - TOUS NULLABLE
  cv_url?: string | null;
  cv_filename?: string | null;
  parseur_doc_id?: string | null;
  status?: string | null;
  date_upload?: string | null;
  date_analyse?: string | null;
  source_analyse?: string | null; // RENDU NULLABLE
  affinda_doc_id?: string | null;
  erreur_analyse?: string | null;
}