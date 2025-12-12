export interface Resumeparser {
  candidate_name?: {
    first_name?: string;
    family_name?: string;
  };
  email?: string[];
  phone_number?: Array<{
    formatted_number?: string;
    raw_text?: string;
  }>;
  location?: {
    formatted?: string;
  };
  website?: Array<{
    url?: string;
  }>;
  skill?: Array<{
    name?: string;
  }>;
  work_experience?: Array<{
    work_experience_job_title?: string;
    work_experience_organization?: string;
    work_experience_location?: {
      formatted?: string;
    };
    work_experience_description?: string;
    work_experience_dates?: {
      start?: {
        date?: string;
      };
      end?: {
        date?: string;
        is_current?: boolean;
      };
    };
  }>;
  education?: Array<{
    education_accreditation?: string;
    education_level?: {
      value?: string;
    };
    education_organization?: string;
    education_major?: string[];
    education_dates?: {
      start?: {
        date?: string;
      };
      end?: {
        date?: string;
      };
    };
  }>;
  language?: Array<{
    language_name?: {
      label?: string;
    };
    language_proficiency?: {
      value?: string;
    };
  }>;
  summary?: string;
}

// types/affinda.ts - Interface spécifique
export interface AffindaCandidat {
  fichier: string;
  cv_url?: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  linkedin: string | null;
  competences: string[];
  metiers: string[];
  formations: any[];
  experiences: any[];
  langues: any[];
  postes?: string[];
  profil: string | null;
  entreprise: string | null;
  niveau: string | null;
  date_analyse?: string;
  source_analyse?: string;
  affinda_doc_id?: string;
}

// types/candidats.ts - Interface principale
export default interface Candidat {
  id?: string;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  fichier: string;
  competences: string[];
  // ... autres champs de base
}