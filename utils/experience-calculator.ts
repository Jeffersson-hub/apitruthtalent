// utils/experience-calculator.ts - VERSION COMPLÈTE
/**
 * Calcule le nombre total d'années d'expérience
 * @param experiences Tableau d'expériences avec { debut: string, fin: string }
 * @returns Nombre d'années d'expérience totales
 */
export function calculateTotalExperience(experiences: any[]): number {
  if (!experiences || !Array.isArray(experiences) || experiences.length === 0) {
    return 0;
  }

  const currentYear = new Date().getFullYear();
  let totalYears = 0;

  for (const exp of experiences) {
    // Extraire l'année de début
    const startYear = extractYear(exp.debut);
    if (!startYear) continue;

    // Extraire l'année de fin (année actuelle si en cours)
    let endYear = extractYear(exp.fin);
    if (!endYear) {
      endYear = currentYear; // Expérience en cours
    }

    // Validation et calcul
    if (endYear >= startYear) {
      totalYears += (endYear - startYear);
    }
  }

  // Arrondir à 1 décimale
  return Math.round(totalYears * 10) / 10;
}

/**
 * Extrait l'année d'une date
 */
export function extractYear(dateStr: string | null): number | null {
  if (!dateStr) return null;
  
  const cleanStr = dateStr.toString().trim();
  
  // Format "2022"
  if (/^\d{4}$/.test(cleanStr)) {
    const year = parseInt(cleanStr, 10);
    if (year >= 1900 && year <= new Date().getFullYear() + 5) {
      return year;
    }
  }
  
  // Format "2022-01-15" ou "15/01/2022"
  const yearMatch = cleanStr.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0], 10);
    if (year >= 1900 && year <= new Date().getFullYear() + 5) {
      return year;
    }
  }
  
  return null;
}