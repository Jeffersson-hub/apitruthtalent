// services/skillMatcher.ts
import { supabase } from '../utils/supabase';

export class SkillMatcher {
  
  async loadExistingSkills(): Promise<Set<string>> {
    try {
      // Récupère toutes les compétences de ta base existante
      const { data: candidates, error } = await supabase
        .from('candidats')
        .select('competences')
        .not('competences', 'is', null)
        .limit(1000); // Limite pour éviter les timeouts
      
      if (error) {
        console.error('Error loading existing skills:', error);
        return new Set();
      }
      
      const allSkills = new Set<string>();
      
      candidates?.forEach(candidate => {
        if (candidate.competences) {
          // Supposons que competences est un array ou un texte
          if (Array.isArray(candidate.competences)) {
            candidate.competences.forEach((skill: string) => {
              if (skill && typeof skill === 'string') {
                allSkills.add(skill.trim());
              }
            });
          } else if (typeof candidate.competences === 'string') {
            // Essayer de parser le texte
            const skills = candidate.competences.split(/[,;]|\n/)
              .map(s => s.trim())
              .filter(s => s.length > 2);
            
            skills.forEach(skill => allSkills.add(skill));
          }
        }
      });
      
      console.log(`Loaded ${allSkills.size} unique skills from database`);
      return allSkills;
      
    } catch (error) {
      console.error('Failed to load existing skills:', error);
      return new Set();
    }
  }
  
  async matchAndEnrichSkills(foundSkills: string[]): Promise<{
    matched: string[];
    newSkills: string[];
    enriched: Array<{skill: string, category?: string, frequency?: number}>;
  }> {
    const existingSkills = await this.loadExistingSkills();
    const matched: string[] = [];
    const newSkills: string[] = [];
    
    // Match exact d'abord
    foundSkills.forEach(skill => {
      if (existingSkills.has(skill)) {
        matched.push(skill);
      } else {
        // Chercher des correspondances partielles
        let foundMatch = false;
        for (const existingSkill of existingSkills) {
          if (this.similarity(skill, existingSkill) > 0.8) {
            matched.push(existingSkill); // Utiliser la version normalisée
            foundMatch = true;
            break;
          }
        }
        if (!foundMatch) {
          newSkills.push(skill);
        }
      }
    });
    
    // Enrichir avec des catégories
    const enriched = [...matched, ...newSkills].map(skill => ({
      skill,
      category: this.categorizeSkill(skill),
      frequency: this.calculateFrequency(skill, existingSkills)
    }));
    
    return {
      matched,
      newSkills,
      enriched
    };
  }
  
  private similarity(s1: string, s2: string): number {
    const s1Lower = s1.toLowerCase();
    const s2Lower = s2.toLowerCase();
    
    if (s1Lower === s2Lower) return 1;
    if (s1Lower.includes(s2Lower) || s2Lower.includes(s1Lower)) return 0.9;
    
    // Jaccard similarity sur les mots
    const words1 = new Set(s1Lower.split(/\s+/));
    const words2 = new Set(s2Lower.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
  
  private categorizeSkill(skill: string): string {
    const skillLower = skill.toLowerCase();
    
    if (skillLower.includes('javascript') || skillLower.includes('react') || 
        skillLower.includes('python') || skillLower.includes('java')) {
      return 'technical';
    }
    
    if (skillLower.includes('excel') || skillLower.includes('word') || 
        skillLower.includes('photoshop') || skillLower.includes('canva')) {
      return 'tools';
    }
    
    if (skillLower.includes('gestion') || skillLower.includes('management') || 
        skillLower.includes('projet') || skillLower.includes('leadership')) {
      return 'management';
    }
    
    if (skillLower.includes('vente') || skillLower.includes('commercial') || 
        skillLower.includes('marketing') || skillLower.includes('négociation')) {
      return 'business';
    }
    
    if (skillLower.includes('anglais') || skillLower.includes('espagnol') || 
        skillLower.includes('français') || skillLower.includes('langue')) {
      return 'language';
    }
    
    return 'other';
  }
  
  private calculateFrequency(skill: string, skillsSet: Set<string>): number {
    // Pour l'instant, retourne 1 si présent, 0 sinon
    return skillsSet.has(skill) ? 1 : 0;
  }
}