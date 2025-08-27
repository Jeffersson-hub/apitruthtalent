export interface Formation {
  debut: string;
  fin: string;
  diplome: string;
  ecole: string;      // jamais null
}

export interface Langue {
  langue: string;     // jamais null
  niveau: string;     // jamais null
}

export interface Experience {
  poste: string | null;
  debut: string;
  fin: string | null;
  entreprise: string | null;
  description?: string;
}

export interface Candidat {
  nom: string | null;
  prenom: string | null;
  profil: string | null;
  email: string | null;
  entreprise: string | null;
  poste: string | null;
  telephone: string | null;
  adresse: string | null;
  competences: string[];
  experiences: Experience[];
  formations: Formation[];
  langues: Langue[];
  liens: string[];
  metiers: string[];
  sourcePath?: string | null;
}
