// types/candidats.ts

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
  niveau: string | null;
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
  
  // Adresse
  adresse: string | null;
  
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
}

export default Candidat;