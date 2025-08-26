export interface Formation {
  raw: string;        // jamais null
}

export interface Langue {
  langue: string;     // jamais null
  niveau: string;     // jamais null
}

export interface Experience {
  poste: string | null;
  entreprise: string | null;
  periode?: string | null;
  description?: string | null;
  debut: string;
  fin: string;
}

export interface Candidat {
  nom: string | null;
  prenom: string | null;
  profil: string | null;
  email: string | null;
  entreprise: string | null;
  telephone: string | null;
  adresse: string | null;
  competences: string[];
  experiences: Experience[];
  linkedin?: string | null;
  formations: Formation[];
  langues: Langue[];
}
