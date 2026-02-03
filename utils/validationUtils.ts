export class ValidationUtils {
  static validateEmail(email: string | null): boolean {
    if (!email) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  static validatePhone(phone: string | null): boolean {
    if (!phone) return false;
    const cleaned = phone.replace(/\s/g, "");
    const phoneRegex = /^(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}$/;
    return phoneRegex.test(cleaned);
  }

  static normalizeName(name: string | null): string | null {
    if (!name) return null;
    return name
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static cleanJobTitle(title: string | null): string | null {
    if (!title) return null;
    // Supprimer les dates, lieux, etc.
    return title
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\b(à|chez|at)\s+.+$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  static calculateConfidence(candidat: any): number {
    let score = 0;
    let maxScore = 0;

    if (candidat.nom && candidat.prenom) score += 30;
    maxScore += 30;

    if (candidat.email) score += 15;
    if (candidat.telephone) score += 15;
    maxScore += 30;

    if (candidat.experiences?.length > 0) {
      score += Math.min(20, candidat.experiences.length * 5);
    }
    maxScore += 20;

    if (candidat.competences?.length > 0) {
      score += Math.min(10, candidat.competences.length * 2);
    }
    maxScore += 10;

    if (candidat.formations?.length > 0) score += 10;
    maxScore += 10;

    return Math.round((score / maxScore) * 100);
  }
}
