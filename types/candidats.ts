// types/candidats.ts
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
  experiences: any[];
  formations: any[];
  langues: any[];
  adresse: string | null;
  linkedin: string | null;
  niveau: string | null;
  
  // Champs avec valeurs par défaut optionnels
  annees_experience?: number; // ← Changé à optionnel
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
}