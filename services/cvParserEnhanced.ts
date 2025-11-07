// services/cvParserEnhanced.ts
import { Candidat } from "../types/candidats";

export class CVParserEnhanced {
  private useExternalAPI = true;

  async parseCV(buffer: Buffer, filename: string, supabase: any): Promise<Candidat> {
    try {
      // Essayer d'abord l'API externe
      if (this.useExternalAPI) {
        try {
          const externalResult = await this.parseWithAffinda(buffer, filename);
          if (externalResult && this.isValidResult(externalResult)) { // VÉRIFIER SI NON NULL
            console.log('✅ CV parsé avec Affinda');
            return externalResult;
          }
        } catch (error) {
          console.warn('❌ Affinda a échoué, fallback vers le parser local');
        }
      }

      // Fallback vers votre parser local
      const localResult = await this.parseLocal(buffer, filename, supabase);
      console.log('✅ CV parsé avec le parser local');
      return localResult;
      
    } catch (error) {
      console.error('💥 Tous les parsers ont échoué');
      return this.createEmptyCandidate(filename);
    }
  }

  private async parseWithAffinda(buffer: Buffer, filename: string): Promise<Candidat | null> { // RETOURNE NULL SI ÉCHEC
    try {
      // Upload temporaire du fichier
      const fileUrl = await this.uploadTempFile(buffer, filename);
      
      const response = await fetch('https://api.affinda.com/v2/documents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AFFINDA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: fileUrl,
          workspace: process.env.AFFINDA_WORKSPACE_ID
        })
      });

      if (!response.ok) {
        throw new Error(`Affinda API error: ${response.status}`);
      }

      const data = await response.json();
      return this.mapAffindaToCandidat(data, filename);
    } catch (error) {
      console.error('Erreur Affinda:', error);
      return null; // RETOURNE NULL AU LIEU DE LANCER UNE ERREUR
    }
  }

  private mapAffindaToCandidat(affindaData: any, filename: string): Candidat {
    const data = affindaData.data;
    
    return {
      fichier: filename,
      nom: data.lastName || null,
      prenom: data.firstName || null,
      email: data.emails?.[0] || null,
      telephone: data.phoneNumbers?.[0] || null,
      adresse: this.extractAddress(data),
      linkedin: this.extractLinkedIn(data),
      competences: this.extractCompetences(data),
      metiers: this.extractMetiers(data),
      formations: this.extractFormations(data),
      experiences: this.extractExperiences(data),
      langues: this.extractLangues(data),
      postes: this.extractPostes(data),
      profil: data.summary || null,
      entreprise: this.extractCurrentCompany(data),
      niveau: this.extractEducationLevel(data),
      source_analyse: 'affinda'
    };
  }

  private extractAddress(data: any): string | null {
    if (data.location && data.location.formatted) {
      return data.location.formatted;
    }
    return null;
  }

  private extractLinkedIn(data: any): string | null {
    if (data.websites) {
      const linkedin = data.websites.find((url: string) => 
        url.toLowerCase().includes('linkedin.com/in/')
      );
      return linkedin || null;
    }
    return null;
  }

  private extractCompetences(data: any): string[] {
    if (!data.skills) return [];
    
    return data.skills
      .map((skill: any) => skill.name)
      .filter((skill: string) => skill && skill.length > 1)
      .slice(0, 15);
  }

  private extractMetiers(data: any): string[] {
    const metiers: string[] = [];
    
    if (data.occupation) {
      metiers.push(data.occupation);
    }
    
    if (data.workExperience) {
      data.workExperience.forEach((exp: any) => {
        if (exp.jobTitle && !metiers.includes(exp.jobTitle)) {
          metiers.push(exp.jobTitle);
        }
      });
    }
    
    return metiers.slice(0, 3);
  }

  private extractExperiences(data: any): any[] {
    if (!data.workExperience) return [];
    
    return data.workExperience.map((exp: any) => ({
      debut: exp.dates?.startDate || null,
      fin: exp.dates?.endDate || null,
      poste: exp.jobTitle || null,
      entreprise: exp.organization || null,
      description: exp.jobDescription || null
    })).slice(0, 10);
  }

  private extractFormations(data: any): any[] {
    if (!data.education) return [];
    
    return data.education.map((edu: any) => ({
      intitule: edu.degree || 'Formation',
      ecole: edu.organization || null,
      diplome: edu.degree || null,
      annee: edu.dates?.completionDate || null,
      raw: `${edu.degree} - ${edu.organization}`
    })).slice(0, 5);
  }

  private extractLangues(data: any): any[] {
    if (!data.languages) return [];
    
    return data.languages.map((lang: string) => ({
      langue: lang,
      niveau: 'Intermédiaire'
    }));
  }

  private extractPostes(data: any): string[] {
    const postes: string[] = [];
    
    if (data.occupation) {
      postes.push(data.occupation);
    }
    
    if (data.workExperience) {
      data.workExperience.forEach((exp: any) => {
        if (exp.jobTitle && !postes.includes(exp.jobTitle)) {
          postes.push(exp.jobTitle);
        }
      });
    }
    
    return postes.slice(0, 5);
  }

  private extractCurrentCompany(data: any): string | null {
    if (data.workExperience && data.workExperience.length > 0) {
      return data.workExperience[0].organization || null;
    }
    return null;
  }

  private extractEducationLevel(data: any): string | null {
    if (!data.education || data.education.length === 0) return null;
    
    const highestEdu = data.education[0];
    
    if (highestEdu.degree) {
      const degree = highestEdu.degree.toLowerCase();
      
      if (degree.includes('doctorat') || degree.includes('phd')) return 'Doctorat';
      if (degree.includes('master') || degree.includes('mastère')) return 'BAC+5';
      if (degree.includes('licence') || degree.includes('bachelor')) return 'BAC+3';
      if (degree.includes('bts') || degree.includes('dut')) return 'BAC+2';
      if (degree.includes('bac')) return 'BAC';
      if (degree.includes('cap') || degree.includes('bep')) return 'CAP/BEP';
    }
    
    return null;
  }

  private isValidResult(result: Candidat | null): boolean { // ACCEPTE NULL
    if (!result) return false;
    return !!(result.nom || result.prenom || result.email || result.experiences.length > 0);
  }

  private async parseLocal(buffer: Buffer, filename: string, supabase: any): Promise<Candidat> {
    // Importer dynamiquement pour éviter les dépendances circulaires
    const { extractCVData } = await import('./documentParser');
    return extractCVData(buffer, filename, supabase);
  }

  private async uploadTempFile(buffer: Buffer, filename: string): Promise<string> {
    // Implémentation simplifiée - retourne une URL fictive pour le test
    return `https://example.com/temp/${filename}`;
  }

  private createEmptyCandidate(filename: string): Candidat {
    return {
      fichier: filename,
      nom: null,
      prenom: null,
      email: null,
      telephone: null,
      adresse: null,
      linkedin: null,
      competences: [],
      metiers: [],
      formations: [],
      experiences: [],
      langues: [],
      postes: [],
      profil: null,
      entreprise: null,
      niveau: null,
      source_analyse: 'erreur'
    };
  }
}