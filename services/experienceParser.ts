// services/experienceParser.ts - VERSION CORRIGÉE
import * as chrono from "chrono-node";

export interface Experience {
  debut: string | null;
  fin: string | null;
  poste: string | null;
  entreprise: string | null;
  description?: string | null;
}

export class ExperienceParser {
  static parseExperiences(text: string): Experience[] {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const experiences: Experience[] = [];
    let currentExp: Experience | null = null;
    let descLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Détecter une nouvelle expérience
      if (this.isExperienceStart(line, lines, i)) {
        // Sauvegarder l'expérience précédente
        if (currentExp) {
          currentExp.description = descLines.join(" ").trim() || null;
          experiences.push(currentExp);
          descLines = [];
        }

        // Créer nouvelle expérience
        currentExp = this.createExperienceFromLine(line, lines, i);
      } else if (currentExp) {
        // Ajouter à la description
        if (line.length > 5 && !this.isLikelyHeader(line)) {
          descLines.push(line);
        }
      }
    }

    // Ajouter la dernière expérience
    if (currentExp) {
      currentExp.description = descLines.join(" ").trim() || null;
      experiences.push(currentExp);
    }

    return this.cleanExperiences(experiences);
  }

  private static isExperienceStart(
    line: string,
    lines: string[],
    index: number,
  ): boolean {
    // Vérifier s'il y a une date
    const hasDate = this.hasDatePattern(line);

    // Vérifier si c'est un titre de poste
    const isJobTitle = this.isJobTitle(line);

    // Vérifier le contexte (ligne après)
    const nextLine = index < lines.length - 1 ? lines[index + 1] : "";

    return (
      (hasDate && (isJobTitle || this.isJobTitle(nextLine))) ||
      (isJobTitle && (hasDate || this.hasDatePattern(nextLine)))
    );
  }

  private static hasDatePattern(text: string): boolean {
    const datePatterns = [
      /\b(19|20)\d{2}\b/,
      /(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i,
      /\d{1,2}[\/\-\.]\d{4}/,
    ];

    return datePatterns.some((pattern) => pattern.test(text));
  }

  private static isJobTitle(text: string): boolean {
    const jobPatterns = [
      /(?:développeur|ingénieur|consultant|manager|directeur|responsable|chef|analyste|architecte|technicien|commercial|chargé|spécialiste|expert)/i,
    ];

    return (
      jobPatterns.some((pattern) => pattern.test(text)) && text.length < 100
    );
  }

  private static isLikelyHeader(text: string): boolean {
    const headerPatterns = [
      /^expérience/i,
      /^formation/i,
      /^compétence/i,
      /^profil/i,
      /^contact/i,
    ];

    return headerPatterns.some((pattern) => pattern.test(text));
  }

  private static createExperienceFromLine(
    line: string,
    lines: string[],
    index: number,
  ): Experience {
    // Extraire la période
    const period = this.extractPeriod(line);

    // Chercher le poste
    let poste = this.extractJobTitle(line);
    if (!poste && index < lines.length - 1) {
      poste = this.extractJobTitle(lines[index + 1]);
    }

    // Chercher l'entreprise
    let entreprise = this.extractCompany(line);
    if (!entreprise) {
      // Chercher dans les lignes suivantes
      for (let i = index + 1; i < Math.min(index + 3, lines.length); i++) {
        const candidate = this.extractCompany(lines[i]);
        if (candidate) {
          entreprise = candidate;
          break;
        }
      }
    }

    return {
      debut: period.debut,
      fin: period.fin,
      poste,
      entreprise,
      description: null,
    };
  }

  private static extractPeriod(text: string): {
    debut: string | null;
    fin: string | null;
  } {
    const results = chrono.parse(text);
    if (results.length > 0) {
      const result = results[0];
      return {
        debut: result.start ? result.start.date().toISOString() : null,
        fin: result.end ? result.end.date().toISOString() : null,
      };
    }
    return { debut: null, fin: null };
  }

  private static extractJobTitle(text: string): string | null {
    const clean = text
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/[^a-zA-ZÀ-ÿ\s\-]/g, " ")
      .trim();

    if (this.isJobTitle(clean) && clean.length > 3 && clean.length < 80) {
      return clean;
    }

    return null;
  }

  private static extractCompany(text: string): string | null {
    // Patterns pour les noms d'entreprise
    const companyIndicators = [
      /(?:SA|SAS|SARL|EI|EURL|SASU|SCOP|SNC|GIE|GEIE)/i,
      /(?:groupe|group|company|corp|inc|llc|société)/i,
    ];

    if (companyIndicators.some((indicator) => indicator.test(text))) {
      return text;
    }

    return null;
  }

  private static cleanExperiences(experiences: Experience[]): Experience[] {
    return experiences.filter(
      (exp) =>
        (exp.poste && exp.poste.length > 0) ||
        (exp.entreprise && exp.entreprise.length > 0),
    );
  }
}
