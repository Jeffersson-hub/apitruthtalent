// services/affindaService.ts
import Candidat from "../types/candidats";

export class AffindaService {
  private apiKey: string;
  private workspaceId: string;
  private baseURL = "https://api.affinda.com/v2";

  constructor() {
    this.apiKey = process.env.AFFINDA_API_KEY!;
    this.workspaceId = process.env.AFFINDA_WORKSPACE_ID!;
  }

  /**
   * Analyser un CV avec Affinda
   */
  async analyzeCV(cvUrl: string, filename: string): Promise<Candidat> {
    try {
      console.log(`🔍 Analyse Affinda: ${filename}`);

      // 1. Créer le document dans Affinda
      const document = await this.createDocument(cvUrl, filename);
      
      // 2. Attendre que l'analyse soit terminée
      await this.waitForAnalysis(document.identifier);
      
      // 3. Récupérer les résultats
      const result = await this.getDocumentResult(document.identifier);
      
      // 4. Mapper vers votre format
      const candidat = this.mapAffindaToCandidat(result, filename, cvUrl);
      
      console.log(`✅ Analyse Affinda terminée: ${filename}`);
      return candidat;

    } catch (error) {
      console.error(`❌ Erreur analyse Affinda ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Créer un document dans Affinda
   */
  private async createDocument(cvUrl: string, filename: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/documents`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: cvUrl,
        fileName: filename,
        workspace: this.workspaceId,
        wait: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Affinda create error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Attendre que l'analyse soit terminée
   */
  private async waitForAnalysis(documentId: string, maxAttempts: number = 30): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.getDocumentStatus(documentId);
      
      if (status === "success") {
        return;
      } else if (status === "error") {
        throw new Error("Affinda analysis failed");
      }
      
      // Attendre 2 secondes avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    throw new Error("Affinda analysis timeout");
  }

  /**
   * Récupérer le statut d'un document
   */
  private async getDocumentStatus(documentId: string): Promise<string> {
    const response = await fetch(`${this.baseURL}/documents/${documentId}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Affinda status error: ${response.status}`);
    }

    const data = await response.json();
    return data.status;
  }

  /**
   * Récupérer les résultats d'analyse
   */
  private async getDocumentResult(documentId: string): Promise<any> {
    const response = await fetch(`${this.baseURL}/documents/${documentId}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Affinda result error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Mapper les données Affinda vers votre format Candidat
   */
  private mapAffindaToCandidat(affindaData: any, filename: string, cvUrl: string): Candidat {
    const data = affindaData.data;
    
    // Récupérer les postes
    const postesArray = this.extractPostes(data);
    const premierPoste = postesArray.length > 0 ? postesArray[0] : null;
    
    return {
      fichier: filename,
      cv_url: cvUrl,
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
      poste: premierPoste,  // ⬅️ UN SEUL poste (string)
      postes: postesArray,  // ⬅️ TOUS les postes (string[]) - optionnel
      profil: data.summary || null,
      entreprise: this.extractCurrentCompany(data),
      niveau: this.extractEducationLevel(data),
      date_analyse: new Date().toISOString(),
      source_analyse: 'affinda',
      affinda_doc_id: affindaData.identifier
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
    
    // Poste actuel
    if (data.occupation) {
      metiers.push(data.occupation);
    }
    
    // Postes des expériences
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
      description: exp.jobDescription || null,
      lieu: exp.location?.formatted || null
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
    
    // Prendre le diplôme le plus récent
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
}

