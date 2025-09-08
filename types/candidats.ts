// types/candidats.ts

export interface Experience {
  poste: string | null;
  entreprise: string | null;
  periode?: string | null;   // ✅ ajouté
  debut?: string;
  fin?: string;
}

export interface Formation {
  intitule: string | null;
  raw?: string; 
  diplome?: string;
  ecole?: string | null;
  localisation?: string;
  date_debut?: string;
  date_fin?: string;         // ✅ ajouté
}

export interface Langue {
  langue: string;
  niveau: string;
}

export interface Candidat {
  id?: number;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  postes: string [];
  profil: string | null;
  entreprise: string | null;
  competences: string[];
  experiences: Experience[];
  formations: Formation[];
  langues: Langue[];
  linkedin?: string | null;  // ✅ ajouté
  fichier?: string | null;
  lien?: string | null;
  metiers: string [];
}
