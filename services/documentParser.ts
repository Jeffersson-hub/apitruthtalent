// services/documentParser.ts - VERSION CORRIGÉE
import { Candidat, Experience, Formation, Langue } from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

// ========================
// TYPES CORRIGÉS
// ========================
interface NameResult {
  nom: string | null;
  prenom: string | null;
}

type DomaineMetier = 
  | 'informatique' 
  | 'industrie_btp' 
  | 'commerce_marketing' 
  | 'sante_bien_etre' 
  | 'education_culture' 
  | 'logistique_services';

interface DictionnaireMetier {
  domaine: DomaineMetier;
  metiers: string[];
}

// ========================
// CONFIGURATION CORRIGÉE
// ========================
const DOMAINES_CONFIG: Record<DomaineMetier, { fichier: string; motsCles: string[] }> = {
  informatique: {
    fichier: "metiers_informatique.json",
    motsCles: ['informatique', 'développeur', 'programmeur', 'software', 'IT', 'réseau', 'système', 'base de données', 'cybersécurité']
  },
  industrie_btp: {
    fichier: "metiers_industrie_btp.json", 
    motsCles: ['industrie', 'btp', 'construction', 'manufacturier', 'production', 'ouvrier', 'technicien', 'chantier']
  },
  commerce_marketing: {
    fichier: "metiers_commerce_marketing.json",
    motsCles: ['commerce', 'marketing', 'vente', 'commercial', 'client', 'account', 'business', 'market']
  },
  sante_bien_etre: {
    fichier: "metiers_sante_bien_etre.json",
    motsCles: ['santé', 'médical', 'infirmier', 'médecin', 'soin', 'bien-être', 'esthétique', 'paramédical']
  },
  education_culture: {
    fichier: "metiers_education_culture.json", 
    motsCles: ['éducation', 'enseignement', 'professeur', 'culture', 'art', 'musique', 'formation', 'pédagogie']
  },
  logistique_services: {
    fichier: "metiers_logistique_services.json",
    motsCles: ['logistique', 'transport', 'supply chain', 'service', 'maintenance', 'entretien', 'logistique']
  }
};

const NIVEAUX_ORDER = [
  "CAP", "BEP", "BAC", "Baccalauréat", 
  "BAC+1", "BAC+2", "BAC+3", "Licence", 
  "BAC+4", "BAC+5", "Master", "Doctorat"
];

// ========================
// CONFIGURATION AMÉLIORÉE DES MÉTIERS (NOUVELLE)
// ========================
const METIERS_REFERENCE: Record<string, string[]> = {
  informatique: [
    'Développeur Fullstack', 'Développeur Frontend', 'Développeur Backend', 
    'Ingénieur DevOps', 'Administrateur Systèmes', 'Architecte Cloud',
    'Data Scientist', 'Data Analyst', 'Ingénieur Machine Learning',
    'Administrateur Base de Données', 'DevOps Engineer', 'Cloud Engineer',
    'Ingénieur Réseaux', 'Cybersécurité', 'Product Owner', 'Scrum Master',
    'Chef de Projet IT', 'Technical Lead', 'CTO', 'Software Engineer'
  ],
  industrie: [
    'Technicien Industriel', 'Ingénieur Process', 'Chef de Chantier',
    'Conducteur de Travaux', 'Mécanicien Industriel', 'Électricien Industriel',
    'Automaticien', 'Responsable Production', 'Opérateur de Production'
  ],
  commerce: [
    'Commercial', 'Business Developer', 'Account Manager', 'Chargé de Clientèle',
    'Responsable Commercial', 'Directeur Commercial', 'Vendeur', 'Conseiller Commercial'
  ],
  marketing: [
    'Marketing Digital', 'Community Manager', 'Content Manager', 'SEO Manager',
    'Growth Hacker', 'Responsable Communication', 'Chargé de Communication'
  ],
  design: [
    'UX Designer', 'UI Designer', 'Graphiste', 'Web Designer', 'Directeur Artistique'
  ]
};

// Mapping des compétences vers les métiers
const COMPETENCE_TO_METIER: Record<string, string[]> = {
  'React': ['Développeur Frontend', 'Développeur Fullstack'],
  'Node.js': ['Développeur Backend', 'Développeur Fullstack'],
  'Python': ['Data Scientist', 'Développeur Backend'],
  'AWS': ['Ingénieur DevOps', 'Architecte Cloud'],
  'Docker': ['Ingénieur DevOps', 'DevOps Engineer'],
  'MySQL': ['Administrateur Base de Données', 'Développeur Backend'],
  'Photoshop': ['Graphiste', 'Web Designer'],
  'SEO': ['Marketing Digital', 'SEO Manager']
};

// ========================
// REGEX
// ========================
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const phoneRegex = /(\+33|0)[1-9](\d{2}){4}/g;
const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/[^\s]+/gi;

// ========================
// FONCTION PRINCIPALE CORRIGÉE
// ========================
export async function extractCVData(buffer: Buffer, filename: string, supabase: any): Promise<Candidat> {
  try {
    console.log(`🔍 Début extraction CV améliorée: ${filename}`);
    
    const rawText = await readText(buffer, filename);
    const cleanText = normalizeTextAmeliore(rawText);

    console.log("📋 Extraction des informations de base...");

    // Extraction des informations de base
    const email = extractEmail(cleanText);
    const telephone = extractTelephone(cleanText);
    const linkedin = extractLinkedIn(cleanText);
    const { nom, prenom } = guessNameAmeliore(cleanText, filename);
    const adresse = guessAddress(cleanText);

    console.log("👤 Informations extraites:", { nom, prenom, email, telephone });

    // Extraction des sections structurées
    const experiences = extractExperiencesAmeliorees(cleanText);
    const formations = extractFormationsAmeliorees(cleanText);
    const competences = extractCompetencesAmeliorees(cleanText);
    
    console.log(`📊 ${experiences.length} expériences, ${formations.length} formations, ${competences.length} compétences`);

    // EXTRACTION DES MÉTIERS AMÉLIORÉE
    const metiers = await extractMetiersIntelligents(cleanText, experiences, competences, supabase);
    const postes = extractPostesFromExperiences(experiences);
    const entreprise = extractEntreprisePrincipale(experiences);
    const niveau = extractNiveauFromFormationsAmeliore(formations);

    // Construction de l'objet candidat
    const candidat: Candidat = {
      fichier: filename,
      nom,
      prenom,
      email,
      telephone,
      adresse,
      linkedin,
      competences,
      metiers: metiers.slice(0, 5),
      formations: formations.slice(0, 10),
      experiences: experiences.slice(0, 10),
      langues: extractLanguesFromText(cleanText),
      postes: postes.slice(0, 5),
      profil: extractProfilFromText(cleanText),
      entreprise,
      niveau
    };

    console.log("✅ Extraction terminée:", {
      nom: candidat.nom,
      prenom: candidat.prenom,
      niveau: candidat.niveau,
      metiers: candidat.metiers,
      competences: candidat.competences.length,
      experiences: candidat.experiences.length
    });

    return candidat;

  } catch (error) {
    console.error(`❌ Erreur lors de l'extraction de ${filename}:`, error);
    return createCandidatVide(filename);
  }
}

// ========================
// EXTRACTION INTELLIGENTE DES MÉTIERS - CORRIGÉE
// ========================
async function extractMetiersIntelligents(
  text: string, 
  experiences: Experience[], 
  competences: string[], 
  supabase: any
): Promise<string[]> {
  console.log("🧠 Extraction intelligente des métiers...");
  
  const metiersTrouves = new Set<string>();

  // 1. PRIORITÉ MAX: Extraction des postes des expériences
  for (const exp of experiences) {
    if (exp.poste) {
      const metierFromPoste = await normaliserMetierIntelligent(exp.poste, supabase);
      if (metierFromPoste) {
        metiersTrouves.add(metierFromPoste);
        console.log(`🎯 Métier depuis poste: "${exp.poste}" -> "${metierFromPoste}"`);
      }
    }
  }

  // 2. Détection par compétences
  for (const competence of competences) {
    const metiersFromCompetence = COMPETENCE_TO_METIER[competence];
    if (metiersFromCompetence) {
      metiersFromCompetence.forEach(metier => metiersTrouves.add(metier));
      console.log(`🛠️ Métier depuis compétence: "${competence}" -> ${metiersFromCompetence.join(', ')}`);
    }
  }

  // 3. Recherche dans le texte avec patterns améliorés
  const metiersFromText = extractMetiersFromText(text);
  metiersFromText.forEach(metier => metiersTrouves.add(metier));

  // 4. Fallback: Titre principal du CV
  if (metiersTrouves.size === 0) {
    const titrePrincipal = extraireTitrePrincipal(text);
    if (titrePrincipal) {
      const metierTitre = await normaliserMetierIntelligent(titrePrincipal, supabase);
      if (metierTitre) {
        metiersTrouves.add(metierTitre);
      }
    }
  }

  const resultat = Array.from(metiersTrouves).slice(0, 3);
  console.log(`🎉 Métiers finaux: ${JSON.stringify(resultat)}`);
  return resultat;
}

// ========================
// NORMALISATION INTELLIGENTE DES MÉTIERS - CORRIGÉE
// ========================
async function normaliserMetierIntelligent(poste: string, supabase: any): Promise<string | null> {
  if (!poste) return null;
  
  const posteClean = cleanMetierItem(poste);
  if (!posteClean) return null;

  // 1. Mapping manuel pour les cas courants
  const mappingManuel: Record<string, string> = {
    // Informatique
    'dev fullstack': 'Développeur Fullstack',
    'dev front': 'Développeur Frontend', 
    'dev back': 'Développeur Backend',
    'developpeur web': 'Développeur Fullstack',
    'software developer': 'Software Engineer',
    'sysadmin': 'Administrateur Systèmes',
    'admin sys': 'Administrateur Systèmes',
    'admin réseau': 'Administrateur Réseaux',
    'data engineer': 'Data Engineer',
    
    // Industrie
    'tech industriel': 'Technicien Industriel',
    'conducteur travaux': 'Conducteur de Travaux',
    'chef de projet': 'Chef de Projet',
    
    // Commerce
    'business dev': 'Business Developer',
    'sales': 'Commercial',
    'account exec': 'Account Manager'
  };

  const posteLower = posteClean.toLowerCase();
  
  // Vérifier le mapping manuel
  for (const [key, value] of Object.entries(mappingManuel)) {
    if (posteLower.includes(key)) {
      console.log(`🗺️ Mapping manuel: "${posteClean}" -> "${value}"`);
      return value;
    }
  }

  // 2. Recherche dans les métiers de référence
  for (const [categorie, metiers] of Object.entries(METIERS_REFERENCE)) {
    for (const metier of metiers) {
      const similarity = calculateSimilarityAmelioree(posteClean, metier);
      if (similarity > 0.7) {
        console.log(`🎯 Similarité trouvée: "${posteClean}" -> "${metier}" (score: ${similarity.toFixed(2)})`);
        return metier;
      }
    }
  }

  // 3. Si pas trouvé, garder le poste nettoyé
  console.log(`⚠️ Métier conservé (non normalisé): "${posteClean}"`);
  return posteClean;
}

// ========================
// EXTRACTION DES MÉTIERS DEPUIS LE TEXTE - CORRIGÉE
// ========================
function extractMetiersFromText(text: string): string[] {
  const metiersTrouves = new Set<string>();
  const textLower = text.toLowerCase();

  // Recherche directe dans le texte
  for (const [categorie, metiers] of Object.entries(METIERS_REFERENCE)) {
    for (const metier of metiers) {
      const metierLower = metier.toLowerCase();
      
      // Recherche exacte
      if (textLower.includes(metierLower)) {
        metiersTrouves.add(metier);
        continue;
      }
      
      // Recherche par mots clés
      const motsMetier = metierLower.split(' ');
      if (motsMetier.length > 1) {
        const tousMotsPresents = motsMetier.every(mot => 
          textLower.includes(mot) && mot.length > 3
        );
        if (tousMotsPresents) {
          metiersTrouves.add(metier);
        }
      }
    }
  }

  return Array.from(metiersTrouves);
}

// ========================
// FONCTIONS EXISTANTES CORRIGÉES
// ========================

async function loadAllDomainDictionaries(supabase: any): Promise<DictionnaireMetier[]> {
  const dictionnaires: DictionnaireMetier[] = [];
  
  for (const [domaine, config] of Object.entries(DOMAINES_CONFIG)) {
    try {
      const metiers = await loadDictionarySafe(supabase, config.fichier);
      dictionnaires.push({
        domaine: domaine as DomaineMetier,
        metiers
      });
    } catch (error) {
      console.warn(`⚠️ Dictionnaire ${config.fichier} non chargé`);
    }
  }
  
  return dictionnaires;
}

function detectDomaines(text: string, dictionnaires: DictionnaireMetier[]): DictionnaireMetier[] {
  const scores: Map<DomaineMetier, number> = new Map();
  
  // Initialiser les scores
  Object.keys(DOMAINES_CONFIG).forEach(domaine => {
    scores.set(domaine as DomaineMetier, 0);
  });
  
  for (const [domaineKey, config] of Object.entries(DOMAINES_CONFIG)) {
    const domaine = domaineKey as DomaineMetier;
    let score = 0;
    
    config.motsCles.forEach(motCle => {
      const regex = new RegExp(`\\b${escapeRegex(motCle)}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) score += matches.length * 2;
    });
    
    const dictDomaine = dictionnaires.find(d => d.domaine === domaine);
    if (dictDomaine) {
      dictDomaine.metiers.forEach(metier => {
        const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
        if (regex.test(text)) score += 3;
      });
    }
    
    scores.set(domaine, score);
  }
  
  return Array.from(scores.entries())
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([domaine]) => {
      const found = dictionnaires.find(d => d.domaine === domaine);
      return found!;
    })
    .filter(Boolean)
    .slice(0, 3);
}

// ========================
// FONCTIONS UTILITAIRES CORRIGÉES
// ========================

function extractEmail(text: string): string | null {
  const match = text.match(emailRegex);
  return match ? match[0] : null;
}

function extractTelephone(text: string): string | null {
  const match = text.match(phoneRegex);
  return match ? match[0] : null;
}

function extractLinkedIn(text: string): string | null {
  const match = text.match(linkedinRegex);
  return match ? match[0] : null;
}

function guessAddress(text: string): string | null {
  const zipCodeRegex = /\b(0[1-9]|[1-8][0-9]|9[0-8])\d{3}\b/;
  const match = text.match(zipCodeRegex);
  return match ? match[0] : null;
}

function extractEntreprisePrincipale(experiences: Experience[]): string | null {
  if (experiences.length === 0) return null;
  return experiences[0].entreprise || null;
}

function extractPostesFromExperiences(experiences: Experience[]): string[] {
  return experiences
    .map(exp => exp.poste)
    .filter((poste): poste is string => !!poste)
    .slice(0, 5);
}

function extractLanguesFromText(text: string): Langue[] {
  const langues: Langue[] = [];
  
  if (text.match(/anglais.*b1|b1.*anglais/i)) {
    langues.push({ langue: 'Anglais', niveau: 'B1' });
  }
  
  if (text.match(/fran[cç]ais/i)) {
    langues.push({ langue: 'Français', niveau: 'Natif' });
  }
  
  return langues;
}

function extractProfilFromText(text: string): string | null {
  const profils = [
    'Technicien Industriel',
    'Ingénieur Informatique', 
    'Ingénieur DevOps',
    'Ingénieur SysOps',
    'Administrateur systèmes',
    'Chef de projet'
  ];
  
  for (const profil of profils) {
    if (text.includes(profil)) {
      return profil;
    }
  }
  
  return null;
}

// ========================
// EXTRACTION DES EXPÉRIENCES - CORRIGÉE
// ========================
function extractExperiencesAmeliorees(text: string): Experience[] {
  const experiences: Experience[] = [];
  
  // Nettoyer le texte
  const cleanText = text.replace(/===== Page \d+ =====/g, '');
  
  // Regex améliorée pour différents formats de dates
  const patterns = [
    // Format: 2020 - 2022 Poste chez Entreprise
    /(\b(19|20)\d{2}\b)\s*(?:-|–|à)\s*(\b(19|20)\d{2}\b|\bprésent\b|\baujourd['']hui\b|\bactuel\b)?\s*([^•\n]{10,200})/gi,
    
    // Format: Poste (2020-2022) - Entreprise
    /([A-Z][^•\n]{10,100}?)\s*\(?\s*(\b(19|20)\d{2}\b)\s*(?:-|–|à)\s*(\b(19|20)\d{2}\b|\bprésent\b)\)?/gi,
    
    // Format: Entreprise | 2020-2022 | Poste
    /([A-Z][A-Za-z0-9&\-\s]{2,})\s*[\|\-]\s*(\b(19|20)\d{2}\b)\s*(?:-|–)\s*(\b(19|20)\d{2}\b|\bprésent\b)\s*[\|\-]\s*([^•\n]{10,100})/gi
  ];

  for (const pattern of patterns) {
    const matches = Array.from(cleanText.matchAll(pattern));
    
    for (const match of matches) {
      let debut, fin, description, poste, entreprise;

      if (pattern === patterns[0]) {
        // Format 1: 2020 - 2022 Poste chez Entreprise
        debut = match[1];
        fin = match[3];
        description = match[5];
        poste = extractPosteFromDescription(description);
        entreprise = extractEntrepriseFromDescription(description);
      } else if (pattern === patterns[1]) {
        // Format 2: Poste (2020-2022) - Entreprise
        poste = match[1];
        debut = match[2];
        fin = match[4];
        description = match[0];
        entreprise = extractEntrepriseFromDescription(description);
      } else {
        // Format 3: Entreprise | 2020-2022 | Poste
        entreprise = match[1];
        debut = match[2];
        fin = match[4];
        poste = match[5];
        description = match[0];
      }

      if (poste || entreprise) {
        experiences.push({
          debut,
          fin,
          poste: poste || 'Poste non spécifié',
          entreprise,
          description: (description || '').slice(0, 500)
        });
      }
    }
  }

  // Déduplication
  return experiences
    .filter((exp, index, self) => 
      index === self.findIndex(e => 
        e.poste === exp.poste && e.entreprise === exp.entreprise
      )
    )
    .slice(0, 10);
}

function extractPosteFromDescription(description: string): string | null {
  const patterns = [
    /^([^•\n\-–—@\(\)]{5,50}?)(?:\s*[-–—]\s*|\s*chez\s*|\s*à\s*|\s*\(|$)/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?:\s+chez|\s+à|\s*-|\s*–|\s*—)/,
    /(?:Poste|Rôle|Fonction)\s*:\s*([^\.\n]{5,50})/
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const poste = match[1].trim();
      if (poste.length > 3 && !poste.match(/^\d/)) {
        return poste;
      }
    }
  }

  return null;
}

function extractEntrepriseFromDescription(description: string): string | null {
  const patterns = [
    /(?:chez|à|@)\s*([A-Z][A-Za-z0-9&\-\s]{2,})/i,
    /([A-Z][A-Za-z0-9&\-\s]{2,})\s*(?:\||-|–|—)/,
    /Entreprise\s*:\s*([^\.\n]{3,50})/
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const entreprise = match[1].trim();
      if (entreprise.length > 2) {
        return entreprise;
      }
    }
  }

  return null;
}

// ========================
// EXTRACTION FORMATIONS - CORRIGÉE
// ========================
function extractFormationsAmeliorees(text: string): Formation[] {
  const formations: Formation[] = [];
  const cleanText = text.replace(/===== Page \d+ =====/g, '');
  
  // Section formations
  const formationsSection = extractSection(
    cleanText,
    /(formations?|formation|dipl[oô]mes?|éducation)/i,
    /(expériences?|expérience|compétences|loisirs|divers)/i
  );
  
  if (!formationsSection) return [];
  
  // Séparer par lignes et filtrer
  const lines = formationsSection.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 5)
    .filter(l => !l.match(/^(#|\*|-)/));
  
  for (const line of lines) {
    // Ignorer les lignes trop courtes ou contenant des mots non pertinents
    if (line.length < 10 || line.match(/loisirs|divers|mad skills|soft skills/i)) {
      continue;
    }
    
    // Détection des formations typiques
    if (line.match(/(master|licence|bts|bep|cap|bac|ingénieur|cesi|ldnr|dgd|afpi)/i)) {
      formations.push({
        intitule: line,
        ecole: extractEcoleFromFormation(line),
        diplome: extractDiplomeFromFormation(line),
        raw: line
      });
    }
  }
  
  return formations.slice(0, 10);
}

function extractEcoleFromFormation(line: string): string | null {
  const ecoles = ['CESI', 'LDNR', 'DGD', 'AFPI', 'Labège', 'Vesoul', 'Besançon'];
  for (const ecole of ecoles) {
    if (line.includes(ecole)) return ecole;
  }
  return null;
}

function extractDiplomeFromFormation(line: string): string {
  return line.split('–')[0]?.trim() || line;
}

// ========================
// EXTRACTION COMPÉTENCES - CORRIGÉE
// ========================
function extractCompetencesAmeliorees(text: string): string[] {
  const competences: Set<string> = new Set();
  const cleanText = text.replace(/===== Page \d+ =====/g, '');
  
  // Section compétences
  const competencesSection = extractSection(
    cleanText,
    /(compétences|skills|savoirs-faires?)/i,
    /(expériences|expérience|formations|formation|langues)/i
  );
  
  const competencesText = competencesSection || cleanText;
  
  // Liste étendue de compétences techniques
  const competencesTechniques = [
    // Cloud & Infrastructure
    'AWS', 'Azure', 'Linux', 'VMware', 'ESX', 'GCP', 'Sharepoint', 'Docker', 'Kubernetes',
    // CI/CD & DevOps
    'GitLab CI', 'Jenkins', 'Bitbucket', 'Ansible', 'Docker', 'Kubernetes',
    // Programmation
    'TypeScript', 'XML', 'Python', 'Bash', 'PowerShell', 'JavaScript', 'Java', 'J2EE', 
    'JSE', 'PHP', 'Spring', 'Maven', 'HTML5', 'CSS3', 'Android', 'Shell',
    // Bases de données
    'MySQL', 'PostgreSQL', 'SQL Server', 'ElasticSearch', 'PostGRE',
    // Supervision & Sécurité
    'Grafana', 'Nagios', 'Fortinet', 'Radius', 'MFA', 'Sonarqube', 'Dynatrace',
    // Outils
    'Visual Studio', 'Office', 'ERP', 'PGI', 'MindManager', 'ServiceNow', 'OpCon',
    // Gestion de projet
    'Agile', 'ITIL', 'AMOA', 'AMOE', 'Scrum', 'Kanban', 'UML',
    // Réseaux
    'LAN', 'VLAN', 'WAN', 'Wifi', 'VPN', 'TCP/IP', 'SFTP', 'SSH'
  ];
  
  // Recherche dans le texte
  for (const competence of competencesTechniques) {
    const regex = new RegExp(`\\b${escapeRegex(competence)}\\b`, 'gi');
    if (regex.test(competencesText)) {
      competences.add(competence);
    }
  }
  
  return Array.from(competences).slice(0, 20);
}

// ========================
// EXTRACTION NIVEAU - CORRIGÉE
// ========================
function extractNiveauFromFormationsAmeliore(formations: Formation[]): string | null {
  const niveaux: string[] = [];

  formations.forEach(formation => {
    const niveau = mapDiplomeToNiveauAmeliore(formation.intitule, formation.raw);
    if (niveau) niveaux.push(niveau);
  });

  // Ajouter la recherche dans l'ensemble du texte des formations
  const textFormations = formations.map(f => `${f.intitule} ${f.raw}`).join(' ');
  const niveauTexte = extractNiveauFromText(textFormations);
  if (niveauTexte) niveaux.push(niveauTexte);

  if (niveaux.length === 0) return null;
  
  return pickHighestLevel(niveaux);
}

function mapDiplomeToNiveauAmeliore(diplome: string | null, rawText: string = ''): string | null {
  if (!diplome && !rawText) return null;
  
  const texteComplet = `${diplome || ''} ${rawText}`.toLowerCase();
  
  // Détection des années d'études
  if (/(1ère|première)\s*(année|year).*bts|bts.*(1ère|première)/i.test(texteComplet)) return "BAC+1";
  if (/(2ème|seconde|2e)\s*(année|year).*bts|bts.*(2ème|seconde)/i.test(texteComplet)) return "BAC+2";
  if (/1ère\s*année|première\s*année|L1|M1/i.test(texteComplet)) return "BAC+1";
  if (/2ème\s*année|seconde\s*année|L2|M2/i.test(texteComplet)) return "BAC+2";
  if (/3ème\s*année|troisième\s*année|L3|M3/i.test(texteComplet)) return "BAC+3";

  // Détection des diplômes avec patterns améliorés
  if (/\b(cap|certificat d'aptitude professionnelle)\b/i.test(texteComplet)) return "CAP";
  if (/\b(bep|brevet d'études professionnelles)\b/i.test(texteComplet)) return "BEP";
  
  // Bac avec guillemets ou parenthèses
  if (/(\bbac\b|baccalauréat|["'«»]bac["'»])/i.test(texteComplet)) return "BAC";
  
  // BAC+2 avec différentes notations
  if (/(bac\+2|\bbts\b|dut|deug|brevet de technicien supérieur|diplôme universitaire de technologie)/i.test(texteComplet)) return "BAC+2";
  
  // BAC+3
  if (/(bac\+3|\blicence\b|bachelor|L3)/i.test(texteComplet)) return "BAC+3";
  
  // BAC+5
  if (/(bac\+5|\bmaster\b|ingénieur|master|mastère|M2)/i.test(texteComplet)) return "BAC+5";
  
  // Doctorat
  if (/(doctorat|phd|bac\+8)/i.test(texteComplet)) return "Doctorat";

  return null;
}

function extractNiveauFromText(text: string): string | null {
  const textLower = text.toLowerCase();
  
  // Recherche de niveaux explicites entre guillemets ou parenthèses
  const niveauExplicite = textLower.match(/["'«»](cap|bep|bac|bac\+?[0-9])["'»]/i);
  if (niveauExplicite) {
    const niveau = niveauExplicite[1].toUpperCase();
    if (niveau === 'BAC') return "BAC";
    if (niveau === 'CAP') return "CAP";
    if (niveau === 'BEP') return "BEP";
    if (niveau.includes('+')) return niveau.toUpperCase();
  }
  
  // Recherche dans des contextes spécifiques
  if (/\b(cap|bep|bac)\b.*["'«»].*["'»]/i.test(textLower)) {
    if (textLower.includes('cap')) return "CAP";
    if (textLower.includes('bep')) return "BEP";
    if (textLower.includes('bac') && !textLower.includes('bac+')) return "BAC";
  }
  
  return null;
}

function pickHighestLevel(niveaux: string[]): string | null {
  if (niveaux.length === 0) return null;
  
  let highest = niveaux[0];
  for (const niveau of niveaux) {
    const currentIndex = NIVEAUX_ORDER.indexOf(niveau);
    const highestIndex = NIVEAUX_ORDER.indexOf(highest);
    
    // Gérer les cas où le niveau n'est pas dans la liste
    if (currentIndex === -1) continue;
    if (highestIndex === -1 || currentIndex > highestIndex) {
      highest = niveau;
    }
  }
  
  return highest;
}

// ========================
// EXTRACTION NOM/PRÉNOM - CORRIGÉE
// ========================
function guessNameAmeliore(raw: string, filename: string): { nom: string | null; prenom: string | null } {
  const lines = raw.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !l.match(/^(tél|tel|phone|mail|email|linkedin|http|#|={3})/i));

  // Recherche dans les premières lignes non-vides
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    
    // Ignorer les lignes trop longues ou contenant des mots-clés de section
    if (line.length > 100 || 
        line.match(/compétences|expériences|formations|mad skills|soft skills/i)) {
      continue;
    }

    // Détection du format "Jean-François BOISGONTIER"
    const nameParts = line.split(/\s+/);
    if (nameParts.length >= 2) {
      // Vérifier si on a un format avec nom en majuscules
      const hasUpperCaseName = nameParts.some(part => 
        part === part.toUpperCase() && part.length > 2 && /^[A-ZÀ-ÿ\-]+$/.test(part)
      );
      
      if (hasUpperCaseName) {
        const upperCaseIndex = nameParts.findIndex(part => 
          part === part.toUpperCase() && part.length > 2
        );
        
        if (upperCaseIndex > 0) {
          // Format: "Jean-François BOISGONTIER"
          return {
            prenom: nameParts.slice(0, upperCaseIndex).join(' '),
            nom: nameParts.slice(upperCaseIndex).join(' ')
          };
        } else if (upperCaseIndex === 0 && nameParts.length > 1) {
          // Format: "BOISGONTIER Jean-François"
          return {
            nom: nameParts[0],
            prenom: nameParts.slice(1).join(' ')
          };
        }
      }
      
      // Fallback: premier mot = prénom, reste = nom
      if (nameParts.length >= 2 && nameParts[0].length > 1) {
        return {
          prenom: nameParts[0],
          nom: nameParts.slice(1).join(' ')
        };
      }
    }
  }

  // Fallback sur le nom du fichier
  const baseName = filename.replace(/\.[^.]+$/, '')
    .replace(/[_\-\s]+/g, ' ')
    .trim();
  
  const parts = baseName.split(/\s+/).filter(p => p.length > 1);
  if (parts.length >= 2) {
    return {
      prenom: parts[0],
      nom: parts.slice(1).join(' ')
    };
  }

  return { nom: null, prenom: null };
}

function isMostlyUpper(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (letters.length === 0) return false;
  const uppers = letters.replace(/[a-zà-öø-ÿ]/g, '');
  return uppers.length / letters.length > 0.5;
}

// ========================
// FONCTIONS UTILITAIRES - CORRIGÉES
// ========================

async function readText(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  
  try {
    if (lower.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      return data.text || '';
    }
    
    if (lower.endsWith('.docx')) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value || '';
    }
    
    return buffer.toString('utf8');
    
  } catch (error) {
    console.error(`Erreur lecture ${filename}:`, error);
    return buffer.toString('utf8');
  }
}

function normalizeTextAmeliore(text: string): string {
  return text
    // Nettoyer les séparateurs de page
    .replace(/===== Page \d+ =====/g, '')
    // Normaliser les séparateurs
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    // Garder la ponctuation française
    .replace(/[�\uFFFD]/g, '')
    .trim();
}

function extractSection(text: string, startRegex: RegExp, endRegex: RegExp): string {
  const startMatch = startRegex.exec(text);
  if (!startMatch) return '';

  let startIndex = startMatch.index + startMatch[0].length;
  let remainingText = text.slice(startIndex);

  const endMatch = endRegex.exec(remainingText);
  if (endMatch) {
    remainingText = remainingText.slice(0, endMatch.index);
  }

  return remainingText.trim();
}

async function loadDictionarySafe(supabase: any, path: string): Promise<string[]> {
  try {
    console.log(`📂 Chargement: ${path}`);
    
    // Essai 1: Fichier direct dans bucket 'dictionaries'
    console.log(`🔍 Essai 1: dictionaries/${path}`);
    const { data, error } = await supabase.storage
      .from('dictionaries')
      .download(path);

    if (!error && data) {
      const text = await data.text();
      const parsed = JSON.parse(text);
      console.log(`✅ Trouvé: dictionaries/${path} (${parsed.length} entrées)`);
      return parsed;
    }

    // Essai 2: Dans sous-dossier 'dictionaries/'
    console.log(`🔍 Essai 2: dictionaries/dictionaries/${path}`);
    const { data: data2, error: error2 } = await supabase.storage
      .from('dictionaries')
      .download(`dictionaries/${path}`);

    if (!error2 && data2) {
      const text = await data2.text();
      const parsed = JSON.parse(text);
      console.log(`✅ Trouvé: dictionaries/dictionaries/${path} (${parsed.length} entrées)`);
      return parsed;
    }

    // Essai 3: Dans bucket 'truthtalent'
    console.log(`🔍 Essai 3: truthtalent/dictionaries/${path}`);
    const { data: data3, error: error3 } = await supabase.storage
      .from('truthtalent')
      .download(`dictionaries/${path}`);

    if (!error3 && data3) {
      const text = await data3.text();
      const parsed = JSON.parse(text);
      console.log(`✅ Trouvé: truthtalent/dictionaries/${path} (${parsed.length} entrées)`);
      return parsed;
    }

    console.warn(`❌ ${path} non trouvé après 3 essais`);
    return [];
    
  } catch (error) {
    console.error(`💥 Erreur: ${path}`, error);
    return [];
  }
}

function createCandidatVide(filename: string): Candidat {
  return {
    fichier: filename,
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

function extraireTitrePrincipal(text: string): string | null {
  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 5 && l.length < 100)
    .filter(l => !l.match(emailRegex) && !l.match(phoneRegex));
  
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    const words = line.split(/\s+/);
    
    if (words.length >= 2 && words.length <= 5 && !isMostlyUpper(line)) {
      if (!line.match(/^(cv|curriculum|resume|nom|prenom|adresse|coordonnées|téléphone|email)/i)) {
        console.log(`🏷️  Titre principal détecté: "${line}"`);
        return line;
      }
    }
  }
  
  return null;
}

function calculateSimilarityAmelioree(a: string, b: string): number {
  const aNorm = a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const bNorm = b.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  if (aNorm === bNorm) return 1.0;
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) return 0.9;
  
  const wordsA = aNorm.split(/\s+/).filter(w => w.length > 2);
  const wordsB = bNorm.split(/\s+/).filter(w => w.length > 2);
  
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  
  const commonWords = wordsA.filter(wordA => 
    wordsB.some(wordB => wordA.includes(wordB) || wordB.includes(wordA))
  );
  
  return commonWords.length / Math.max(wordsA.length, wordsB.length);
}

function cleanMetierItem(item: string): string {
  return item
    .replace(/\([^)]*\)/g, '') // Supprimer les parenthèses
    .replace(/[^a-zA-ZÀ-ÿ0-9\s\-]/g, ' ') // Garder lettres, chiffres, tirets
    .replace(/\s+/g, ' ') // Espaces multiples -> simple
    .trim()
    .split(' ')
    .filter(word => word.length > 1 && !word.match(/^(de|du|des|le|la|les|à|chez|en|pour|avec|sans)$/i))
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}