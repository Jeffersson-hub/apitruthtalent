// types/candidats.ts

export interface Experience {
  poste: string | null;
  entreprise: string | null;
  periode?: string | null;   // ✅ ajouté
  debut?: string;
  fin?: string;
}

export interface Formation {
  intitule?: string;
  raw?: string; 
  diplome?: string;
  ecole?: string;            // ✅ ajouté
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
  poste?: string | null;
  profil?: string | null;
  entreprise?: string | null;
  competences: string[];
  // experiences: undefined;
  formations: Formation[];
  //langues: Langue[];
  linkedin?: string | null;  // ✅ ajouté
  fichier?: string | null;
  lien?: string | null;
  metiers: string [];
}
