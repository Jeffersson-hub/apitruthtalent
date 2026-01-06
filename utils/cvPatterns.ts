// utils/cvPatterns.ts
export const CV_PATTERNS = {
  PRIMARY_ROLES: [
    { name: 'Développeur', patterns: [/développeur/i, /developer/i, /dev\b/i, /programmeur/i] },
    { name: 'Commercial', patterns: [/commercial/i, /vente/i, /vendeur/i, /business development/i] },
    { name: 'Marketing', patterns: [/marketing/i, /digital marketing/i, /communication/i, /brand/i] },
    { name: 'Gestionnaire', patterns: [/gestionnaire/i, /administratif/i, /back.office/i, /office manager/i] },
    { name: 'Chef de projet', patterns: [/chef de projet/i, /project manager/i, /chargé de projet/i, /project lead/i] },
    { name: 'Consultant', patterns: [/consultant/i, /conseil/i, /advisor/i, /freelance/i] },
    { name: 'Analyste', patterns: [/analyste/i, /data analyst/i, /business analyst/i, /financial analyst/i] },
    { name: 'Designer', patterns: [/designer/i, /graphiste/i, /ui.ux/i, /web designer/i] },
    { name: 'RH', patterns: [/rh\b/i, /ressources humaines/i, /recruteur/i, /talent acquisition/i] },
    { name: 'Finance', patterns: [/finance/i, /comptable/i, /audit/i, /contrôleur/i, /accountant/i] },
    { name: 'Juridique', patterns: [/juridique/i, /avocat/i, /legal/i, /notaire/i] },
    { name: 'IT', patterns: [/IT\b/i, /informatique/i, /technicien/i, /support/i, /helpdesk/i] },
    { name: 'Logistique', patterns: [/logistique/i, /supply chain/i, /achats/i, /procurement/i] },
    { name: 'Santé', patterns: [/infirmier/i, /médecin/i, /pharmacien/i, /santé/i] },
    { name: 'Éducation', patterns: [/enseignant/i, /professeur/i, /éducateur/i, /formateur/i] }
  ]
};

export function detectPrimaryRole(text: string): string {
  const textLower = text.toLowerCase();
  let bestMatch = { role: 'Non spécifié', score: 0 };

  CV_PATTERNS.PRIMARY_ROLES.forEach(({ name, patterns }) => {
    patterns.forEach(pattern => {
      const match = textLower.match(pattern);
      if (match) {
        const position = match.index || 0;
        const score = 1 + (1000 / (position + 1));
        if (score > bestMatch.score) {
          bestMatch = { role: name, score };
        }
      }
    });
  });

  return bestMatch.role;
}