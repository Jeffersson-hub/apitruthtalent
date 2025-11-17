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