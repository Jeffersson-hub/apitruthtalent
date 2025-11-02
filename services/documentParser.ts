// services/documentParser.ts
import { Candidat, Experience, Formation, Langue } from "../types/candidats";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

// ========================
// TYPES
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
// CONFIGURATION
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
// REGEX
// ========================
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
const phoneRegex = /(\+33|0)[1-9](\d{2}){4}/g;
const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/[^\s]+/gi;

// ========================
// FONCTIONS PRINCIPALES AMÉLIORÉES
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

    // Extraction des métiers
    const metiers = await extractMetiersAmeliores(cleanText, supabase);
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
// EXTRACTION MÉTIERS AVEC DOMAINES
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
  
  Object.keys(DOMAINES_CONFIG).forEach(domaine => {
    scores.set(domaine as DomaineMetier, 0);
  });
  
  for (const [domaine, config] of Object.entries(DOMAINES_CONFIG)) {
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
    
    scores.set(domaine as DomaineMetier, score);
  }
  
  return Array.from(scores.entries())
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([domaine]) => dictionnaires.find(d => d.domaine === domaine)!)
    .slice(0, 3);
}

async function extractMetiersFromDomaine(text: string, domaine: DictionnaireMetier, supabase: any): Promise<string[]> {
  const metiersTrouves: string[] = [];
  
  // Recherche exacte dans le dictionnaire
  for (const metier of domaine.metiers) {
    const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
    if (regex.test(text)) {
      metiersTrouves.push(metier);
    }
  }
  
  // Extraction des postes des expériences
  const experiences = extractExperiencesAmeliorees(text);
  for (const exp of experiences) {
    if (exp.poste) {
      const metierNormalise = await findMetierInDictionaries(exp.poste, [domaine]);
      if (metierNormalise && !metiersTrouves.includes(metierNormalise)) {
        metiersTrouves.push(metierNormalise);
      }
    }
  }
  
  return metiersTrouves.slice(0, 3);
}

async function extractMetiersFallback(text: string, supabase: any): Promise<string[]> {
  const metiers: Set<string> = new Set();
  const allDictionnaires = await loadAllDomainDictionaries(supabase);
  const allMetiers = allDictionnaires.flatMap(d => d.metiers);
  
  // Recherche directe
  for (const metier of allMetiers) {
    const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
    if (regex.test(text)) metiers.add(metier);
  }
  
  // Extraction des expériences
  const experiences = extractExperiencesAmeliorees(text);
  for (const exp of experiences) {
    if (exp.poste) {
      const cleanPoste = cleanMetierItem(exp.poste);
      if (cleanPoste) {
        const similarMetier = findSimilarMetier(cleanPoste, allMetiers);
        if (similarMetier) {
          metiers.add(similarMetier);
        } else {
          metiers.add(cleanPoste);
        }
      }
    }
  }
  
  return Array.from(metiers).slice(0, 3);
}

// ========================
// FONCTIONS UTILITAIRES MÉTIERS
// ========================

async function findMetierInDictionaries(terme: string, dictionnaires: DictionnaireMetier[]): Promise<string | null> {
  const termeNormalise = normalizeForMatching(terme);
  const allMetiers = dictionnaires.flatMap(d => d.metiers);
  
  for (const metier of allMetiers) {
    if (normalizeForMatching(metier) === termeNormalise) return metier;
  }
  
  for (const metier of allMetiers) {
    const similarity = calculateSimilarity(termeNormalise, normalizeForMatching(metier));
    if (similarity > 0.8) return metier;
  }
  
  return null;
}

function findSimilarMetier(terme: string, metiersList: string[]): string | null {
  const termeNormalise = normalizeForMatching(terme);
  
  for (const metier of metiersList) {
    const metierNormalise = normalizeForMatching(metier);
    const similarity = calculateSimilarity(termeNormalise, metierNormalise);
    if (similarity > 0.7) return metier;
  }
  
  return null;
}

function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(a: string, b: string): number {
  const wordsA = a.split(' ');
  const wordsB = b.split(' ');
  const commonWords = wordsA.filter(word => wordsB.includes(word));
  return commonWords.length / Math.max(wordsA.length, wordsB.length);
}

function cleanMetierItem(item: string): string | null {
  let clean = item
    .replace(/\([^)]*\)/g, '')
    .replace(/\d{4}/g, '')
    .replace(/(cdi|cdd|stage|alternance|apprentissage|contrat|temps|plein|partiel)/gi, '')
    .replace(/[^a-zA-ZÀ-ÿ0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (clean.length < 2 || clean.length > 50) return null;
  if (clean.split(' ').length > 4) return null;
  if (/^(19|20)\d{2}$/.test(clean)) return null;
  
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========================
// FONCTIONS D'EXTRACTION DE BASE
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

// ========================
// EXTRACTION DES SECTIONS AMÉLIORÉES
// ========================

function extractExperiencesAmeliorees(text: string): Experience[] {
  const experiences: Experience[] = [];
  
  // Nettoyer le texte
  const cleanText = text.replace(/===== Page \d+ =====/g, '');
  
  // Regex améliorée pour capturer différents formats de dates
  const expRegex = /(\b(19|20)\d{2}\b)(?:\s*(?:-|–|à)\s*(\b(19|20)\d{2}\b|\bprésent\b|\baujourd['']hui\b|\bactuel\b))?([^•]*?)(?=(?:\b(19|20)\d{2}\b|\bdomaine\b|\bformations\b|\n\s*\n))/gis;
  
  const matches = Array.from(cleanText.matchAll(expRegex));
  
  for (const match of matches) {
    const debut = match[1] || null;
    const fin = match[3] || null;
    const description = (match[5] || '').trim();
    
    // Extraction du poste et entreprise
    let poste = null;
    let entreprise = null;
    
    // Chercher le poste (première phrase ou avant un séparateur)
    const posteMatch = description.match(/^([^•\n\-–—]+?)(?:\s*[-–—]\s*|\s*chez\s*|\s*à\s*|\s*\(|$)/);
    if (posteMatch) {
      poste = posteMatch[1].trim();
    }
    
    // Chercher l'entreprise
    const entrepriseMatch = description.match(/(?:chez|à|@)\s*([A-Z][A-Za-z0-9&\-\s]{2,})/i);
    if (entrepriseMatch) {
      entreprise = entrepriseMatch[1].trim();
    } else {
      // Sinon chercher entre parenthèses
      const entrepriseParens = description.match(/\(([^)]+)\)/);
      if (entrepriseParens && !entrepriseParens[1].match(/(CDI|CDD|stage|alternance)/i)) {
        entreprise = entrepriseParens[1].trim();
      }
    }
    
    if (poste || entreprise) {
      experiences.push({
        debut,
        fin,
        poste,
        entreprise,
        description: description.slice(0, 1000)
      });
    }
  }
  
  return experiences.slice(0, 15);
}

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

function extractPostesFromExperiences(experiences: Experience[]): string[] {
  return experiences
    .map(exp => exp.poste)
    .filter((poste): poste is string => !!poste)
    .slice(0, 5);
}

// ========================
// EXTRACTION NIVEAU AMÉLIORÉE
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
// EXTRACTION NOM/PRÉNOM AMÉLIORÉE
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
// FONCTIONS UTILITAIRES SUPPLÉMENTAIRES
// ========================

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
    'Technicien industriel',
    'Ingénieur informatique', 
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
// LECTURE ET NETTOYAGE
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

// ========================
// GESTION DICTIONNAIRES
// ========================

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

// ========================
// FONCTION UTILITAIRE
// ========================

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

async function extractMetiersAmeliores(text: string, supabase: any): Promise<string[]> {
  console.log("🔍 Début extraction métiers améliorée");
  
  const metiersTrouves = new Set<string>();
  const cleanedText = normalizeTextAmeliore(text);
  
  // Étape 1: Extraction des postes des expériences (PRIORITÉ MAX)
  const experiences = extractExperiencesAmeliorees(cleanedText);
  console.log(`📊 Expériences trouvées: ${experiences.length}`);
  
  for (const exp of experiences) {
    if (exp.poste) {
      console.log(`🎯 Analyse poste: "${exp.poste}"`);
      const metierNormalise = await normaliserMetier(exp.poste, supabase);
      if (metierNormalise) {
        metiersTrouves.add(metierNormalise);
        console.log(`✅ Poste normalisé: "${exp.poste}" -> "${metierNormalise}"`);
      } else {
        // Si pas trouvé dans les dictionnaires, on garde le poste original nettoyé
        const posteClean = cleanMetierItem(exp.poste);
        if (posteClean) {
          metiersTrouves.add(posteClean);
          console.log(`⚠️  Poste conservé (non normalisé): "${posteClean}"`);
        }
      }
    }
  }
  
  // Étape 2: Recherche dans les dictionnaires (en priorité basse)
  if (metiersTrouves.size === 0) {
    console.log("🔍 Aucun métier trouvé dans les expériences, recherche dans les dictionnaires...");
    const dictionnaires = await loadAllDomainDictionaries(supabase);
    
    for (const dict of dictionnaires) {
      for (const metier of dict.metiers) {
        const regex = new RegExp(`\\b${escapeRegex(metier)}\\b`, 'gi');
        if (regex.test(cleanedText)) {
          metiersTrouves.add(metier);
          console.log(`📚 Métier trouvé via dictionnaire: "${metier}"`);
          break;
        }
      }
    }
  }
  
  // Étape 3: Extraction du titre principal comme fallback
  if (metiersTrouves.size === 0) {
    const titrePrincipal = extraireTitrePrincipal(cleanedText);
    if (titrePrincipal) {
      const metierTitre = await normaliserMetier(titrePrincipal, supabase) || cleanMetierItem(titrePrincipal);
      if (metierTitre) {
        metiersTrouves.add(metierTitre);
        console.log(`🏷️  Métier depuis titre: "${metierTitre}"`);
      }
    }
  }
  
  const resultat = Array.from(metiersTrouves).slice(0, 3);
  console.log(`🎉 Métiers finaux: ${JSON.stringify(resultat)}`);
  return resultat;
}

async function normaliserMetier(poste: string, supabase: any): Promise<string | null> {
  if (!poste) return null;
  
  const posteClean = cleanMetierItem(poste);
  if (!posteClean) return null;
  
  // Liste de mapping manuel pour les cas courants
  const mappingManuel: Record<string, string> = {
    'administrateur systeme': 'Administrateur systèmes',
    'administrateur systeme network': 'Administrateur systèmes et réseaux',
    'ingenieur en chef satellite': 'Ingénieur spatial',
    'ingenieur satellite': 'Ingénieur spatial',
    'concepteur developpeur applications': 'Développeur fullstack',
    'chef de projet informatique': 'Chef de projet IT',
    'charge de communication': 'Chargé de communication',
    'community manager': 'Community Manager',
    'vendeur conseiller omnicanal': 'Vendeur',
    'equipier polyvalent commerce': 'Vendeur',
    'poissonnier': 'Poissonnier',
    'serveur': 'Serveur',
    'runner': 'Serveur',
    'maquilleuse': 'Maquilleuse',
    'professeur de violon': 'Professeur de musique',
    'technicien industriel': 'Technicien industriel',
    'ingenieur devops': 'Ingénieur DevOps',
    'ingenieur sysops': 'Ingénieur SysOps',
    'administrateur sharepoint': 'Administrateur SharePoint',
    'preparateur methodes': 'Préparateur méthodes',
    'programmeur fao': 'Programmeur FAO'
  };
  
  const posteLower = posteClean.toLowerCase();
  
  // Vérifier le mapping manuel d'abord
  for (const [key, value] of Object.entries(mappingManuel)) {
    if (posteLower.includes(key)) {
      console.log(`🗺️  Mapping manuel: "${posteClean}" -> "${value}"`);
      return value;
    }
  }
  
  // Ensuite, chercher dans les dictionnaires
  const allDictionnaires = await loadAllDomainDictionaries(supabase);
  const tousMetiers = allDictionnaires.flatMap(d => d.metiers);
  
  // Recherche exacte
  for (const metierRef of tousMetiers) {
    if (normalizeForMatching(posteClean) === normalizeForMatching(metierRef)) {
      return metierRef;
    }
  }
  
  // Recherche par similarité
  let meilleurMetier: string | null = null;
  let meilleurScore = 0.6;
  
  for (const metierRef of tousMetiers) {
    const score = calculateSimilarityAmelioree(posteClean, metierRef);
    if (score > meilleurScore) {
      meilleurScore = score;
      meilleurMetier = metierRef;
    }
  }
  
  if (meilleurMetier) {
    console.log(`🎯 Similarité trouvée: "${posteClean}" -> "${meilleurMetier}" (score: ${meilleurScore.toFixed(2)})`);
  }
  
  return meilleurMetier;
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
  const aNorm = normalizeForMatching(a);
  const bNorm = normalizeForMatching(b);
  
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    return 0.9;
  }
  
  const wordsA = aNorm.split(' ').filter(w => w.length > 2);
  const wordsB = bNorm.split(' ').filter(w => w.length > 2);
  
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  
  let score = intersection.size / union.size;
  
  if (wordsA[0] === wordsB[0]) score += 0.3;
  if (wordsA[wordsA.length - 1] === wordsB[wordsB.length - 1]) score += 0.2;
  
  return Math.min(score, 1.0);
}