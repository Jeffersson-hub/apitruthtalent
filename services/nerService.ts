// services/nerService.ts - Version connectée au service Python
export class LightNERService {
  private serviceUrl: string;
  
  constructor(serviceUrl = 'https://your-service.onrender.com') {
    this.serviceUrl = serviceUrl;
  }
  
  async extractEntities(text: string): Promise<any> {
    // Limiter la taille pour éviter les timeouts
    if (text.length > 10000) {
      text = text.substring(0, 10000) + '... [TRONCATED]';
    }
    
    try {
      const response = await fetch(`${this.serviceUrl}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'fr' }),
        // Timeout court pour Render gratuit
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        throw new Error(`NER service error: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.warn('NER service failed, using local fallback:', error);
      return this.localFallbackNER(text);
    }
  }
  
  private localFallbackNER(text: string): any {
    // Extraction locale légère
    const skills = this.extractSkills(text);
    const contact = this.extractContact(text);
    const entities = this.extractBasicEntities(text);
    
    return {
      entities,
      skills,
      contact_info: contact,
      confidence: 0.6,
      source: 'local_fallback',
      processing_time_ms: 10,
      memory_used_mb: 5
    };
  }
  
  private extractSkills(text: string): Array<{name: string, confidence: number}> {
    const textLower = text.toLowerCase();
    const skills: Array<{name: string, confidence: number}> = [];
    
    const skillList = [
      'javascript', 'react', 'node', 'python', 'typescript',
      'java', 'sql', 'docker', 'aws', 'html', 'css', 'git'
    ];
    
    skillList.forEach(skill => {
      if (textLower.includes(skill)) {
        skills.push({
          name: skill.charAt(0).toUpperCase() + skill.slice(1),
          confidence: 0.8
        });
      }
    });
    
    return skills;
  }
  
  private extractContact(text: string): any {
    const emails = (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []);
    const phones = (text.match(/0[1-9](?:[\s.-]?\d{2}){4}/g) || []);
    
    return {
      emails: [...new Set(emails)],
      phones: [...new Set(phones)],
      linkedin: null,
      github: null
    };
  }
  
  private extractBasicEntities(text: string): any[] {
    const entities: any[] = [];
    
    // Emails
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    emails.forEach(email => {
      entities.push({
        text: email,
        label: 'EMAIL',
        confidence: 0.95
      });
    });
    
    return entities;
  }
}