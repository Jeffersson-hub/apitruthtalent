// services/skillMatcher.ts - Version simplifiée
import { supabase } from '../utils/supabase';

export class SkillMatcher {
  
  async loadExistingSkills(): Promise<Set<string>> {
    try {
      const { data: candidates, error } = await supabase
        .from('candidats')
        .select('competences')
        .not('competences', 'is', null)
        .limit(1000);
      
      if (error) {
        console.error('Error loading existing skills:', error);
        return new Set();
      }
      
      const allSkills = new Set<string>();
      
      // Type assertion explicite
      const typedCandidates = candidates as any[];
      
      typedCandidates?.forEach((candidate: any) => {
        if (candidate.competences) {
          if (Array.isArray(candidate.competences)) {
            candidate.competences.forEach((skill: string) => {
              if (skill && typeof skill === 'string') {
                allSkills.add(skill.trim());
              }
            });
          } else if (typeof candidate.competences === 'string') {
            // Utiliser une méthode plus sûre
            const skills = this.safeSplit(candidate.competences);
            skills.forEach((skill: string) => allSkills.add(skill));
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
  
  private safeSplit(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    
    try {
      return text
        .split(/[,;]|\n/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 2);
    } catch {
      return [];
    }
  }
  
  // ... reste du code inchangé ...
}