// services/affindaEnhancedService.ts

import { Resumeparser } from '../types/affinda';
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cpdokjsyxmohubgvxift.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwZG9ranN5eG1vaHViZ3Z4aWZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI2MzI1MzQsImV4cCI6MjA2ODIwODUzNH0.R_E0t1WLWby-ZeqohAL8HUumto5uYPTJacnqij-JVaM';
const AFFINDA_API_KEY = process.env.AFFINDA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export class AffindaEnhancedService {
  
  /**
   * Traiter un webhook Affinda et insérer dans Supabase
   */
  async processAffindaWebhook(event: any): Promise<any> {
    console.log('🔔 Webhook Affinda reçu:', event);

    // Récupérer l'identifiant du document
    const documentIdentifier = event.document_identifier;
    if (!documentIdentifier) {
      throw new Error("document_identifier manquant");
    }

    // Récupérer le document analysé depuis Affinda
    const documentData = await this.getAffindaDocument(documentIdentifier);
    
    if (!documentData?.data) {
      throw new Error("Données Affinda invalides");
    }

    // Désérialiser les données (vous devrez adapter le modèle Resumeparser)
    const resume = documentData.data as Resumeparser;
    
    // Extraire les métadonnées
    const meta = documentData.meta || {};
    const filename = meta.fileName || 'unknown';
    
    // Construire l'URL du fichier
    const fileUrl = `https://cpdokjsyxmohubgvxift.supabase.co/storage/v1/object/public/truthtalent/cvs/${filename}`;
    
    // Extraire et formater les données
    const candidateData = this.extractCandidateData(resume, filename, fileUrl);
    
    // Insérer dans Supabase
    await this.insertIntoSupabase(candidateData);
    
    return {
      success: true,
      candidate: {
        nom: candidateData.nom,
        prenom: candidateData.prenom,
        email: candidateData.email
      }
    };
  }

  /**
   * Récupérer un document depuis l'API Affinda
   */
  private async getAffindaDocument(documentIdentifier: string): Promise<any> {
    const response = await fetch(`https://api.affinda.com/v3/documents/${documentIdentifier}`, {
      headers: {
        'Authorization': `Bearer ${AFFINDA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erreur Affinda: ${response.status} - ${await response.text()}`);
    }

    return response.json();
  }

  /**
   * Extraire les données du CV (adapté du code Python)
   */
  private extractCandidateData(resume: any, filename: string, fileUrl: string): any {
    // Nom et prénom
    let nom: string | null = null;
    let prenom: string | null = null;

    if (resume.candidate_name) {
      // Nettoyer le nom de famille
      if (resume.candidate_name.family_name) {
        nom = resume.candidate_name.family_name.trim();
        nom = nom ? this.capitalizeName(nom) : null;
      }

      // Nettoyer le prénom - VERSION ULTRA SÉCURISÉE
        const rawFirstName = resume?.candidate_name?.first_name;

        if (rawFirstName && typeof rawFirstName === 'string' && rawFirstName.trim().length > 0) {
        prenom = rawFirstName.trim();
        // Supprimer espaces multiples et tirets mal placés
        prenom = prenom.replace(/\s+/g, ' ');
        prenom = prenom.replace(/\s*-\s*/g, '-');
        
        // Gérer les prénoms composés
        if (prenom.includes('-')) {
            const parts = prenom.split('-');
            prenom = parts.map(part => this.capitalizeName(part)).join('-');
        } else {
            prenom = this.capitalizeName(prenom);
        }
        } else {
        prenom = null;
        console.log('⚠️ Prénom non trouvé ou invalide dans les données Affinda');
        }
    }
    

    // Email - prendre le premier et nettoyer
    let email: string | null = null;
    if (resume.email && resume.email.length > 0) {
      email = resume.email[0]?.replace(/\s+/g, '') || null;
    }

    // Téléphone - prendre le premier numéro formaté
    let telephone: string | null = null;
    if (resume.phone_number && resume.phone_number.length > 0) {
      const phone = resume.phone_number[0];
      telephone = phone.formatted_number || phone.raw_text || null;
    }

    // Adresse formatée
    const adresse = resume.location?.formatted || null;

    // LinkedIn
    let linkedin: string | null = null;
    if (resume.website) {
      for (const site of resume.website) {
        if (site.url && site.url.toLowerCase().includes('linkedin')) {
          linkedin = site.url;
          break;
        }
      }
    }

    // Compétences
    const competences: string[] = [];
    if (resume.skill) {
      for (const skill of resume.skill) {
        if (skill.name) {
          competences.push(skill.name);
        }
      }
    }

    // Métiers (titres de poste uniques)
    let metiers: string | null = null;
    if (resume.work_experience) {
      const uniqueTitles = new Set<string>();
      for (const exp of resume.work_experience) {
        if (exp.work_experience_job_title) {
          uniqueTitles.add(exp.work_experience_job_title);
        }
      }
      if (uniqueTitles.size > 0) {
        metiers = Array.from(uniqueTitles).join(', ');
      }
    }

    // Formations
    const formations: any[] = [];
    if (resume.education) {
      for (const edu of resume.education) {
        const formation = {
          diplome: edu.education_accreditation || null,
          niveau: edu.education_level?.value || null,
          organisation: edu.education_organization || null,
          domaine: edu.education_major?.[0] || null,
          date_debut: edu.education_dates?.start?.date || null,
          date_fin: edu.education_dates?.end?.date || null,
        };
        formations.push(formation);
      }
    }

    // Expériences professionnelles
    const experiences: any[] = [];
    if (resume.work_experience) {
      for (const exp of resume.work_experience) {
        const experience = {
          poste: exp.work_experience_job_title || null,
          entreprise: exp.work_experience_organization || null,
          lieu: exp.work_experience_location?.formatted || null,
          description: exp.work_experience_description || null,
          date_debut: exp.work_experience_dates?.start?.date || null,
          date_fin: exp.work_experience_dates?.end?.date || null,
          en_cours: exp.work_experience_dates?.end?.is_current || false,
        };
        experiences.push(experience);
      }
    }

    // Langues
    const langues: any[] = [];
    if (resume.language) {
      for (const lang of resume.language) {
        const langue = {
          nom: lang.language_name?.label || null,
          niveau: lang.language_proficiency?.value || null,
        };
        langues.push(langue);
      }
    }

    // Postes (tous les titres)
    let postes: string | null = null;
    if (resume.work_experience) {
      const allTitles: string[] = [];
      for (const exp of resume.work_experience) {
        if (exp.work_experience_job_title) {
          allTitles.push(exp.work_experience_job_title);
        }
      }
      if (allTitles.length > 0) {
        postes = allTitles.join(', ');
      }
    }

    // Profil
    const profil = resume.summary || null;

    // Entreprise actuelle
    let entreprise: string | null = null;
    if (resume.work_experience) {
      // Chercher l'expérience en cours
      for (const exp of resume.work_experience) {
        if (exp.work_experience_dates?.end?.is_current) {
          entreprise = exp.work_experience_organization || null;
          break;
        }
      }
      // Si pas d'expérience en cours, prendre la plus récente
      if (!entreprise && resume.work_experience.length > 0) {
        entreprise = resume.work_experience[0].work_experience_organization || null;
      }
    }

    // Niveau d'éducation
    const niveau = this.extractEducationLevel(resume);

    return {
      nom,
      prenom,
      email,
      telephone,
      adresse,
      linkedin,
      competences,
      metiers,
      formations,
      experiences,
      langues,
      postes,
      profil,
      entreprise,
      niveau,
      cv_url: `cvs/${filename}`,
      cv_filename: filename,
      date_upload: new Date().toISOString(),
      date_analyse: new Date().toISOString(),
      source_analyse: 'affinda'
    };
  }

  /**
   * Extraire le niveau d'éducation avec hiérarchie
   */
  private extractEducationLevel(resume: any): string | null {
    if (!resume.education) return null;

    const niveauHierarchy: { [key: string]: string } = {
      'doctorat': 'Doctorat',
      'phd': 'Doctorat',
      'master 2': 'BAC+5',
      'master': 'BAC+5',
      'mastère': 'BAC+5',
      'm2': 'BAC+5',
      'master 1': 'BAC+4',
      'm1': 'BAC+4',
      'licence': 'BAC+3',
      'bachelor': 'BAC+3',
      'bts': 'BAC+2',
      'dut': 'BAC+2',
      'deug': 'BAC+2',
      'baccalauréat': 'BAC',
      'bac': 'BAC',
      'bep': 'BEP',
      'cap': 'CAP'
    };

    let meilleurNiveau: string | null = null;
    let meilleurScore = 0;

    for (const edu of resume.education) {
      const textToSearch: string[] = [];
      
      if (edu.education_accreditation) {
        textToSearch.push(edu.education_accreditation.toLowerCase());
      }
      
      if (edu.education_level?.value) {
        textToSearch.push(edu.education_level.value.toLowerCase());
      }
      
      if (edu.education_major) {
        textToSearch.push(...edu.education_major.map((m: string) => m.toLowerCase()));
      }

      const fullText = textToSearch.join(' ');

      for (const [motCle, niveauLabel] of Object.entries(niveauHierarchy)) {
        if (fullText.includes(motCle)) {
          // Éviter les faux positifs
          if (motCle === 'bachelor' && fullText.includes('bts')) continue;
          
          const score = Object.keys(niveauHierarchy).indexOf(motCle);
          if (score > meilleurScore) {
            meilleurScore = score;
            meilleurNiveau = niveauLabel;
          }
        }
      }
    }

    return meilleurNiveau;
  }

  /**
   * Capitaliser les noms correctement
   */
  private capitalizeName(name: string): string {
    if (!name) return '';
    
    // Gérer les noms avec particules (de, la, du, etc.)
    const particules = ['de', 'la', 'le', 'du', 'des', 'd'];
    
    return name.split(' ')
      .map((part, index) => {
        const lowerPart = part.toLowerCase();
        if (index > 0 && particules.includes(lowerPart)) {
          return lowerPart;
        }
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Insérer les données dans Supabase
   */
  private async insertIntoSupabase(candidateData: any): Promise<void> {
    const { data, error } = await supabase
      .from('candidats')
      .insert(candidateData)
      .select()
      .single();

    if (error) {
      // Gestion des doublons
      if (error.code === '23505') {
        console.log('🔄 Doublon détecté, mise à jour...');
        
        const { data: updatedData, error: updateError } = await supabase
          .from('candidats')
          .update(candidateData)
          .eq('email', candidateData.email)
          .select()
          .single();

        if (updateError) throw updateError;
        console.log('✅ Candidat mis à jour:', updatedData.id);
        return;
      }
      throw error;
    }

    console.log('✅ Candidat créé avec ID:', data.id);
    
  }
}