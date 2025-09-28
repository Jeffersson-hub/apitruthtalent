// utils/extractCVData.ts
import type { Candidat, Experience, Formation, Langue } from "../types/candidats";

// ... (le reste du code reste le même jusqu'à la fonction toFormations)

function toFormations(section: string): Formation[] {
  if (!section) return [];

  const blocks = section.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const formations: Formation[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    const intitule = lines[0].replace(/^[•\-*]\s*/, '');
    const ecole = lines.length > 1 ? lines[1] : null;

    const formation: Formation = {
      intitule: intitule || null,
      ecole: ecole || null,
      diplome: intitule || null, // Ajouter la propriété diplome
      raw: block
    };
    
    formations.push(formation);
  }

  return formations;
}

// ... (le reste du code)

function createCandidatVide(filename: string): Candidat {
  return {
    fichier: filename || null,
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
    niveau: null
  };
}