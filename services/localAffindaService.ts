import { Resumeparser } from '../types/affinda';

export class LocalAffindaService {
  
  /**
   * Analyser un CV localement en utilisant la logique Affinda
   */
  async analyzeCV(fileBuffer: Buffer, filename: string, fileUrl: string): Promise<any> {
    console.log('🔍 Analyse locale du CV avec logique Affinda');

    try {
      // Étape 1: Extraire le texte du PDF
      const pdfText = await this.extractTextFromPDF(fileBuffer);
      
      // Étape 2: Parser le texte avec la logique Affinda
      const resumeData = this.parseCVText(pdfText, filename);
      
      // Étape 3: Formater les données comme Affinda le ferait
      const candidateData = this.formatCandidateData(resumeData, filename, fileUrl);
      
      console.log('✅ Analyse locale réussie:', {
        nom: candidateData.nom,
        prenom: candidateData.prenom,
        email: candidateData.email
      });
      
      return candidateData;
      
    } catch (error: any) { // Correction: spécifier le type 'any'
      console.error('❌ Erreur analyse locale:', error);
      throw new Error(`Échec de l'analyse locale: ${error.message}`);
    }
  }

  /**
   * Extraire le texte d'un PDF
   */
  private async extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
    try {
      // Utilisez pdf-parse si installé
      const pdf = require('pdf-parse');
      const data = await pdf(fileBuffer);
      return data.text;
    } catch (error) {
      // Fallback: retourner un texte basique
      console.warn('PDF parsing échoué, utilisation du fallback');
      return `CV: ${fileBuffer.toString('utf8').substring(0, 1000)}`;
    }
  }

  /**
   * Parser le texte du CV avec la logique Affinda
   */
  private parseCVText(text: string, filename: string): any {
    console.log('📝 Parsing du texte CV...');
    
    const resumeData: any = {
      candidate_name: this.extractName(text, filename),
      email: this.extractEmail(text),
      phone_number: this.extractPhoneNumbers(text),
      skills: this.extractSkills(text),
      work_experience: this.extractWorkExperience(text),
      education: this.extractEducation(text),
      summary: this.extractSummary(text),
      location: this.extractLocation(text)
    };

    return resumeData;
  }

  /**
   * Extraire le nom
   */
  private extractName(text: string, filename: string): any {
    const nameFromFilename = this.extractNameFromFilename(filename);
    if (nameFromFilename.first_name || nameFromFilename.family_name) {
      return nameFromFilename;
    }

    const lines = text.split('\n');
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      if (line && line.length > 3 && line.length < 50) {
        const name = this.parseNameFromText(line);
        if (name.first_name || name.family_name) {
          return name;
        }
      }
    }

    return {};
  }

  /**
   * Extraire le nom depuis le filename
   */
  private extractNameFromFilename(filename: string): any {
    const cleanName = filename
      .replace(/\.pdf$/i, '')
      .replace(/[_-]/g, ' ')
      .replace(/\d+/g, '')
      .trim();

    const parts = cleanName.split(' ').filter(part => part.length > 1);
    
    if (parts.length === 0) return {};
    if (parts.length === 1) return { family_name: parts[0] };
    
    if (filename.match(/CV_/i) || filename.match(/resume_/i)) {
      return { 
        family_name: parts[1], 
        first_name: parts.slice(2).join(' ') || parts[0] 
      };
    }
    
    return { 
      family_name: parts[parts.length - 1], 
      first_name: parts.slice(0, -1).join(' ') 
    };
  }

  /**
   * Parser le nom depuis le texte
   */
  private parseNameFromText(line: string): any {
    const words = line.split(' ').filter(w => w.length > 1);
    
    if (words.length >= 2) {
      return {
        first_name: words[0],
        family_name: words[words.length - 1]
      };
    }
    
    return {};
  }

  /**
   * Extraire les emails
   */
  private extractEmail(text: string): string[] {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    
    return emails
      .map(email => email.replace(/\s+/g, '').toLowerCase())
      .filter((email, index, self) => self.indexOf(email) === index)
      .slice(0, 3);
  }

  /**
   * Extraire les numéros de téléphone
   */
  private extractPhoneNumbers(text: string): any[] {
    const phoneRegex = /(\+33|0)[1-9](\d{2}){4}/g;
    const phones = text.match(phoneRegex) || [];
    
    return phones.map(phone => ({
      raw_text: phone,
      formatted_number: this.formatPhoneNumber(phone)
    })).slice(0, 3);
  }

  private formatPhoneNumber(phone: string): string {
    return phone.replace(/(\+33|0)(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})/, '+33 $2 $3 $4 $5 $6');
  }

  /**
   * Extraire les compétences
   */
  private extractSkills(text: string): any[] {
    const commonSkills = [
      'javascript', 'typescript', 'python', 'java', 'react', 'angular', 'vue',
      'node.js', 'express', 'mongodb', 'postgresql', 'mysql', 'docker', 'aws',
      'azure', 'git', 'agile', 'scrum', 'leadership', 'management', 'communication'
    ];

    const skills: any[] = [];
    const lowerText = text.toLowerCase();

    commonSkills.forEach(skill => {
      if (lowerText.includes(skill)) {
        skills.push({ name: skill.charAt(0).toUpperCase() + skill.slice(1) });
      }
    });

    return skills.slice(0, 15);
  }

  /**
   * Extraire l'expérience professionnelle
   */
  private extractWorkExperience(text: string): any[] {
    const experiences: any[] = [];
    const lines = text.split('\n');
    
    let currentExperience: any = {};
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      if (this.isJobTitleLine(trimmed)) {
        if (currentExperience.work_experience_job_title) {
          experiences.push(currentExperience);
        }
        currentExperience = {
          work_experience_job_title: trimmed,
          work_experience_organization: this.extractCompanyFromLine(trimmed)
        };
      }
      else if (this.isCompanyLine(trimmed) && currentExperience.work_experience_job_title) {
        currentExperience.work_experience_organization = trimmed;
      }
    });
    
    if (currentExperience.work_experience_job_title) {
      experiences.push(currentExperience);
    }
    
    return experiences.slice(0, 10);
  }

  private isJobTitleLine(line: string): boolean {
    const jobIndicators = ['developer', 'engineer', 'manager', 'director', 'consultant', 'analyst', 'designer'];
    return jobIndicators.some(indicator => line.toLowerCase().includes(indicator));
  }

  private isCompanyLine(line: string): boolean {
    const companyIndicators = ['sas', 'sa', 'sarl', 'eurl', 'ltd', 'inc', 'corp'];
    return companyIndicators.some(indicator => 
      line.toLowerCase().includes(indicator) || line.length < 30
    );
  }

  private extractCompanyFromLine(line: string): string {
    return line.split(' at ').pop() || 
           line.split(' chez ').pop() || 
           line.split(' - ').pop() || 
           line;
  }

  /**
   * Extraire l'éducation
   */
  private extractEducation(text: string): any[] {
    const education: any[] = [];
    const lines = text.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      if (this.isEducationLine(trimmed)) {
        education.push({
          education_accreditation: trimmed,
          education_organization: this.extractSchoolFromLine(trimmed),
          education_level: {
            value: this.extractEducationLevel(trimmed)
          }
        });
      }
    });
    
    return education.slice(0, 5);
  }

  private isEducationLine(line: string): boolean {
    const educationIndicators = [
      'bac', 'bts', 'dut', 'licence', 'master', 'mastère', 'doctorat',
      'école', 'université', 'faculté', 'diplôme', 'certification'
    ];
    return educationIndicators.some(indicator => line.toLowerCase().includes(indicator));
  }

  private extractSchoolFromLine(line: string): string {
    return line.split(' - ').shift() || 
           line.split(' à ').pop() || 
           line.split(' @ ').pop() || 
           line;
  }

  private extractEducationLevel(line: string): string {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('doctorat') || lowerLine.includes('phd')) return 'Doctorat';
    if (lowerLine.includes('master') || lowerLine.includes('mastère')) return 'BAC+5';
    if (lowerLine.includes('licence') || lowerLine.includes('bachelor')) return 'BAC+3';
    if (lowerLine.includes('bts') || lowerLine.includes('dut')) return 'BAC+2';
    if (lowerLine.includes('bac')) return 'BAC';
    
    return 'Non spécifié';
  }

  /**
   * Extraire le résumé
   */
  private extractSummary(text: string): string {
    const lines = text.split('\n').filter(line => line.trim().length > 10);
    return lines.slice(0, 3).join(' ').substring(0, 500) || 'CV analysé localement';
  }

  /**
   * Extraire la localisation
   */
  private extractLocation(text: string): any {
    const frenchCities = ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'nantes', 'strasbourg'];
    const lines = text.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const city of frenchCities) {
        if (lowerLine.includes(city)) {
          return { formatted: line.trim() };
        }
      }
    }
    
    return {};
  }

  /**
   * Formater les données finales
   */
  private formatCandidateData(resumeData: any, filename: string, fileUrl: string): any {
    return {
      nom: resumeData.candidate_name?.family_name || null,
      prenom: resumeData.candidate_name?.first_name || null,
      email: resumeData.email?.[0] || null,
      telephone: resumeData.phone_number?.[0]?.formatted_number || null,
      adresse: resumeData.location?.formatted || null,
      linkedin: null, // À implémenter
      competences: (resumeData.skills || []).map((s: any) => s.name),
      metiers: this.extractJobs(resumeData.work_experience),
      formations: this.formatEducation(resumeData.education),
      experiences: this.formatExperiences(resumeData.work_experience),
      langues: [],
      postes: this.extractPositions(resumeData.work_experience),
      profil: resumeData.summary,
      entreprise: this.extractCurrentCompany(resumeData.work_experience),
      niveau: this.extractEducationLevelFromData(resumeData.education),
      cv_url: fileUrl,
      cv_filename: filename,
      date_upload: new Date().toISOString(),
      date_analyse: new Date().toISOString(),
      source_analyse: 'local_affinda'
    };
  }

  // CORRECTION: Spécifier le type de retour
  private extractJobs(workExperience: any[] | undefined): string[] {
    if (!workExperience) return [];
    
    const jobs = workExperience
      .map((exp: any) => exp.work_experience_job_title)
      .filter((job: string | undefined): job is string => !!job); // Filtre les undefined
    
    return [...new Set(jobs)].slice(0, 5);
  }

  private formatEducation(education: any[] | undefined): any[] {
    if (!education) return [];
    
    return education.map((edu: any) => ({
      intitule: edu.education_accreditation,
      ecole: edu.education_organization,
      diplome: edu.education_accreditation,
      annee: null
    }));
  }

  private formatExperiences(experiences: any[] | undefined): any[] {
    if (!experiences) return [];
    
    return experiences.map((exp: any) => ({
      poste: exp.work_experience_job_title,
      entreprise: exp.work_experience_organization,
      description: null,
      debut: null,
      fin: null
    }));
  }

  private extractPositions(workExperience: any[] | undefined): string[] {
    if (!workExperience) return [];
    
    return workExperience
      .map((exp: any) => exp.work_experience_job_title)
      .filter((job: string | undefined): job is string => !!job);
  }

  private extractCurrentCompany(workExperience: any[] | undefined): string | null {
    return workExperience?.[0]?.work_experience_organization || null;
  }

  private extractEducationLevelFromData(education: any[] | undefined): string | null {
    return education?.[0]?.education_level?.value || null;
  }
}