// services/localNERService.ts - VERSION CORRIGÉE
import nlp from 'compromise';

export class LocalNERService {
  extractNames(text: string): { prenom: string | null; nom: string | null } {
    try {
      // Compromise s'utilise directement comme fonction
      const doc = (nlp as any)(text);
      const people = doc.people();
      
      if (people.length > 0) {
        const names = people.out('array');
        for (const name of names) {
          const parts = name.split(/\s+/);
          if (parts.length >= 2) {
            return { prenom: parts[0], nom: parts.slice(1).join(" ") };
          }
        }
      }
      
      // Fallback: chercher des patterns de noms
      const namePattern = /([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+)\s+([A-ZÀ-Ÿ][a-zà-ÿéèêë'’-]+)/;
      const match = text.match(namePattern);
      if (match) {
        return { prenom: match[1], nom: match[2] };
      }
    } catch (error) {
      console.error("Local NER error:", error);
    }
    
    return { prenom: null, nom: null };
  }
  
  extractCompanies(text: string): string[] {
    try {
      const doc = (nlp as any)(text);
      const orgs = doc.organizations();
      const companies = orgs.out('array');
      
      // Filtrer pour garder les noms plausibles d'entreprises
      return companies
        .filter((company: string) => company.length > 2 && company.length < 50)
        .slice(0, 5);
    } catch (error) {
      console.error("Company extraction error:", error);
      return [];
    }
  }
  
  extractJobTitles(text: string): string[] {
    const titlePatterns = [
      /(?:Développeur|Ingénieur|Consultant|Manager|Directeur|Responsable|Chef de projet|Analyste|Architecte|Technicien|Commercial|Chargé de|Spécialiste|Expert)[\s\w]*/gi,
    ];
    
    const titles = new Set<string>();
    for (const pattern of titlePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => titles.add(match.trim()));
      }
    }
    
    return Array.from(titles);
  }
  
  extractSkills(text: string): string[] {
    // Patterns pour les compétences techniques
    const skillPatterns = [
      /(?:JavaScript|TypeScript|Python|Java|C\+\+|C#|PHP|Ruby|Go|Rust|SQL|NoSQL|MongoDB|PostgreSQL|MySQL|React|Angular|Vue\.js|Node\.js|Express|Django|Flask|Spring|AWS|Azure|GCP|Docker|Kubernetes|Git|Jenkins|CI\/CD)/gi,
      /(?:HTML5?|CSS3?|SASS|SCSS|Less|Webpack|Babel|REST API|GraphQL|Microservices|Agile|Scrum)/gi,
    ];
    
    const skills = new Set<string>();
    for (const pattern of skillPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => skills.add(match.trim()));
      }
    }
    
    return Array.from(skills);
  }
}