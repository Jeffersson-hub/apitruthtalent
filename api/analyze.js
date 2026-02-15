// api/analyze.js
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '50mb' }));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// LISTE ÉTENDUE DES COMPÉTENCES
// ============================================
const TECHNICAL_SKILLS = [
  // Cloud & DevOps
  "AWS", "Amazon Web Services", "Azure", "GCP", "Google Cloud", "Cloud",
  "Docker", "Kubernetes", "K8s", "Terraform", "Ansible", "Jenkins", "CI/CD",
  "GitLab CI", "GitHub Actions", "CircleCI", "Travis CI", "DevOps",
  
  // Langages de programmation
  "Python", "Java", "JavaScript", "TypeScript", "Go", "Golang", "Rust",
  "C#", "CSharp", "PHP", "Ruby", "Swift", "Kotlin", "Scala", "Perl",
  "Bash", "Shell", "PowerShell", "C++", "C", "Dart", "Elixir",
  
  // Frameworks Frontend
  "React", "ReactJS", "Angular", "AngularJS", "Vue", "VueJS", "Vue.js",
  "Svelte", "Next.js", "Nuxt.js", "Gatsby", "Remix", "SolidJS",
  "jQuery", "Bootstrap", "Tailwind", "Material UI", "Chakra UI",
  
  // Frameworks Backend
  "Node.js", "NodeJS", "Express", "ExpressJS", "Django", "Flask",
  "Spring", "Spring Boot", "Laravel", "Symfony", "Ruby on Rails", "Rails",
  "ASP.NET", ".NET Core", "FastAPI", "NestJS", "Koa", "Phoenix",
  
  // Bases de données
  "PostgreSQL", "Postgres", "MySQL", "MariaDB", "MongoDB", "Redis",
  "Elasticsearch", "Elastic", "Cassandra", "DynamoDB", "Firebase",
  "Supabase", "SQLite", "Oracle", "SQL Server", "CouchDB", "Neo4j",
  
  // ERP & CRM (spécifique à votre domaine)
  "ERP", "SAP", "Oracle ERP", "Microsoft Dynamics", "Dynamics 365",
  "Odoo", "Salesforce", "CRM", "HubSpot", "Zoho", "Sage",
  "Projet ERP", "Chef de projet ERP", "Gestion de projet ERP",
  
  // Méthodologies
  "Agile", "Scrum", "Kanban", "SAFe", "Lean", "Waterfall", "Cascade",
  "Gestion de projet", "Project Management", "PMP", "PRINCE2",
  
  // Outils de gestion de projet
  "Jira", "Confluence", "Trello", "Asana", "Monday.com", "Notion",
  "ClickUp", "Redmine", "Microsoft Project", "MS Project", "Gantt",
  
  // Compétences fonctionnelles
  "Analyse fonctionnelle", "Spécifications", "Rédaction de cahier des charges",
  "BPML", "UML", "Merise", "Architecture", "Solution design",
  
  // Soft Skills
  "Communication", "Management", "Leadership", "Team management",
  "Encadrement", "Formation", "Mentorat", "Négociation",
  "Résolution de problèmes", "Problem solving", "Prise de décision"
];

// ============================================
// FONCTIONS D'EXTRACTION AMÉLIORÉES
// ============================================

/**
 * Extrait le texte brut du fichier (PDF ou DOCX)
 */
async function extractTextFromFile(fileBuffer, fileType) {
  try {
    let text = '';
    
    if (fileType === 'pdf') {
      const pdfData = await pdfParse(Buffer.from(fileBuffer));
      text = pdfData.text;
    } else if (fileType === 'docx') {
      const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      text = docxData.value;
    } else {
      throw new Error('Format de fichier non supporté');
    }
    
    // Normaliser le texte
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
      
  } catch (error) {
    console.error('Erreur extraction texte:', error);
    throw error;
  }
}

/**
 * Extrait le nom complet (amélioré)
 */
function extractFullName(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 2);
  
  // Patterns pour trouver le nom (souvent en haut du CV)
  const namePatterns = [
    /^([A-Z][A-Za-zéèêëàâîïôöûüç\s-]{2,50})$/m,  // Ligne en majuscules/minuscules
    /^([A-Z]{2,}(?:\s+[A-Z]{2,})*)$/m,            // Tout en majuscules
    /^([A-Z][a-zéèêëàâîïôöûüç]+(?:\s+[A-Z][a-zéèêëàâîïôöûüç]+){1,3})$/m // Nom avec majuscule à chaque mot
  ];
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 3 && match[1].length < 50) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * Extrait TOUTES les compétences du texte
 */
function extractAllSkills(text) {
  const foundSkills = new Set();
  const textLower = text.toLowerCase();
  
  for (const skill of TECHNICAL_SKILLS) {
    const skillLower = skill.toLowerCase();
    
    // Vérifier si la compétence apparaît dans le texte
    if (textLower.includes(skillLower) || 
        textLower.includes(skillLower.replace(/\s+/g, '')) ||
        textLower.includes(skillLower.replace(/[.-]/g, ''))) {
      foundSkills.add(skill);
    }
    
    // Vérifier les variantes (ex: "reactjs" pour "React")
    if (skillLower.includes(' ') || skillLower.includes('.')) {
      const compactVersion = skillLower.replace(/[.\s-]/g, '');
      if (textLower.includes(compactVersion)) {
        foundSkills.add(skill);
      }
    }
  }
  
  // Chercher aussi dans les lignes individuelles
  const lines = text.split('\n');
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    
    // Sections de compétences courantes
    if (lineLower.includes('compétence') || 
        lineLower.includes('skill') || 
        lineLower.includes('technologie') ||
        lineLower.includes('outil') ||
        lineLower.includes('tool') ||
        lineLower.includes('langage')) {
      
      // Extraire les mots de cette ligne
      const words = line.split(/[\s,;|•\-]+/);
      for (const word of words) {
        if (word.length > 2 && TECHNICAL_SKILLS.some(s => 
          s.toLowerCase().includes(word.toLowerCase()) ||
          word.toLowerCase().includes(s.toLowerCase())
        )) {
          foundSkills.add(word);
        }
      }
    }
  }
  
  return Array.from(foundSkills).sort();
}

/**
 * Extrait les expériences professionnelles (amélioré)
 */
function extractExperiences(text) {
  const experiences = [];
  const lines = text.split('\n');
  let currentExp = null;
  let inExperienceSection = false;
  
  // Patterns pour détecter le début de la section expérience
  const expSectionPatterns = [
    /expérience(s)? professionnelle(s)?/i,
    /work experience/i,
    /employment/i,
    /career/i,
    /parcours professionnel/i
  ];
  
  // Patterns pour détecter une ligne d'expérience
  const expLinePatterns = [
    /(\d{4})\s*[-–—]\s*(\d{4}|présent|now|current)/i,  // 2018 - 2024
    /(?:de|from)\s+(\d{4})\s+(?:à|to)\s+(\d{4}|présent)/i,
    /(\d{4})\s*[-–—]\s*aujourd'hui/i,
    /(?:jan|fév|mar|avr|mai|juin|juil|aoû|sep|oct|nov|déc)[a-z]*\.?\s+\d{4}/i
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Détecter le début de la section expérience
    if (!inExperienceSection) {
      for (const pattern of expSectionPatterns) {
        if (pattern.test(line) && line.length < 50) {
          inExperienceSection = true;
          break;
        }
      }
      continue;
    }
    
    // Vérifier si on est dans une nouvelle expérience (ligne avec date)
    let hasDate = false;
    for (const pattern of expLinePatterns) {
      if (pattern.test(line)) {
        hasDate = true;
        break;
      }
    }
    
    // Si on a une date et qu'on n'est pas dans une expérience, nouvelle expérience
    if (hasDate && (!currentExp || currentExp.description.length > 0)) {
      if (currentExp && currentExp.poste) {
        experiences.push(currentExp);
      }
      
      currentExp = {
        poste: null,
        entreprise: null,
        date_debut: null,
        date_fin: null,
        description: []
      };
      
      // Extraire les dates
      const dateMatch = line.match(/(\d{4})\s*[-–—]\s*(\d{4}|présent|now|current|aujourd'hui)/i);
      if (dateMatch) {
        currentExp.date_debut = dateMatch[1];
        currentExp.date_fin = dateMatch[2].toLowerCase() === 'présent' || 
                             dateMatch[2].toLowerCase() === 'now' || 
                             dateMatch[2].toLowerCase() === 'current' ||
                             dateMatch[2].toLowerCase() === "aujourd'hui" 
                             ? 'présent' : dateMatch[2];
      }
      
      // La ligne actuelle contient souvent le poste et l'entreprise
      currentExp.poste = line;
      currentExp.entreprise = "Entreprise non spécifiée";
    }
    
    // Si on est dans une expérience, ajouter la ligne à la description
    if (currentExp) {
      // Essayer d'extraire l'entreprise si pas encore fait
      if (!currentExp.entreprise || currentExp.entreprise === "Entreprise non spécifiée") {
        const companyMatch = line.match(/(?:chez|@|at|à)\s+([A-Z][A-Za-z0-9\s\-&]+)/i);
        if (companyMatch) {
          currentExp.entreprise = companyMatch[1].trim();
        } else if (line.includes('SARL') || line.includes('SAS') || line.includes('SA') || 
                   line.includes('GmbH') || line.includes('Ltd')) {
          currentExp.entreprise = line;
        }
      }
      
      // Ajouter à la description si ce n'est pas trop long
      if (currentExp.description.join(' ').length < 500) {
        currentExp.description.push(line);
      }
    }
  }
  
  // Ajouter la dernière expérience
  if (currentExp && currentExp.poste) {
    experiences.push(currentExp);
  }
  
  return experiences.slice(0, 10); // Limiter à 10 expériences
}

/**
 * Extrait les formations
 */
/* function extractEducation(text) {
  const education = [];
  const lines = text.split('\n');
  let inEducationSection = false;
  let currentEdu = null;
  
  const eduSectionPatterns = [
    /formation(s)?/i,
    /éducation/i,
    /education/i,
    /diplôme(s)?/i,
    /degree(s)?/i,
    /cursus/i
  ];
  
  const degreePatterns = [
    /master/i,
    /bachelor/i,
    /licence/i,
    /doctorat/i,
    /phd/i,
    /ingénieur/i,
    /engineer/i,
    /mba/i,
    /bac\+?(\d+)/i,
    /diplôme/i,
    /degree/i
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Détecter le début de la section formation
    if (!inEducationSection) {
      for (const pattern of eduSectionPatterns) {
        if (pattern.test(line) && line.length < 50) {
          inEducationSection = true;
          break;
        }
      }
      continue;
    }
    
    // Détecter une formation (ligne avec diplôme ou année)
    const hasDegree = degreePatterns.some(p => p.test(line));
    const hasYear = line.match(/\b(19|20)\d{2}\b/);
    
    if ((hasDegree || hasYear) && (!currentEdu || currentEdu.diplome)) {
      if (currentEdu && currentEdu.diplome) {
        education.push(currentEdu);
      }
      
      currentEdu = {
        diplome: line,
        etablissement: null,
        annee: hasYear ? hasYear[0] : null
      };
    }
    
    // Si on a déjà une formation en cours, essayer d'ajouter l'établissement
    if (currentEdu && !currentEdu.etablissement) {
      const uniPatterns = [/université/i, /école/i, /institut/i, /campus/i, /university/i, /college/i, /school/i];
      if (uniPatterns.some(p => p.test(line))) {
        currentEdu.etablissement = line;
      }
    }
  }
  
  // Ajouter la dernière formation
  if (currentEdu && currentEdu.diplome) {
    education.push(currentEdu);
  }
  
  return education;
} */
  function extractEducation(sections) {
  const education = [];
  const eduText = sections.education || '';

  if (!eduText) return education;

  const eduBlocks = eduText.split(/\n\s*\n/);

  for (const block of eduBlocks) {
    const lines = block.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 1) continue;

    const edu = {
      diplome: lines[0],
      etablissement: lines[1] || null,
      annee: null
    };

    // Chercher l'année
    for (const line of lines) {
      const year = line.match(/\b(19|20)\d{2}\b/);
      if (year) {
        edu.annee = year[0];
        break;
      }
    }

    education.push(edu);
  }

  return education;
}

/**
 * Calcule les années d'expérience totales
 */
function calculateTotalExperience(experiences) {
  let totalYears = 0;
  const currentYear = new Date().getFullYear();
  
  for (const exp of experiences) {
    const debut = parseInt(exp.date_debut);
    let fin = exp.date_fin === 'présent' ? currentYear : parseInt(exp.date_fin);
    
    if (!isNaN(debut) && !isNaN(fin) && fin >= debut) {
      totalYears += (fin - debut);
    }
  }
  
  return Math.round(totalYears * 10) / 10; // Arrondir à 1 décimale
}

/**
 * Calcule le hash du fichier
 */
function calculateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ============================================
// ROUTE PRINCIPALE
// ============================================

app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath, jobDescription } = req.body;
    
    console.log('📥 Requête reçue:', { filePath });

    if (!filePath) {
      return res.status(400).json({ error: 'filePath requis' });
    }

    // 1. Télécharger le fichier
    console.log('📥 Téléchargement depuis Supabase...');
    const { data: file, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Erreur téléchargement: ${downloadError.message}`);
    }

    const fileBuffer = await file.arrayBuffer();
    const fileType = filePath.split('.').pop().toLowerCase();
    const fileHash = calculateFileHash(Buffer.from(fileBuffer));

    console.log('✅ Fichier téléchargé, type:', fileType);

    // 2. Extraire le texte
    const rawText = await extractTextFromFile(fileBuffer, fileType);
    console.log('✅ Texte extrait, longueur:', rawText.length);

    // 3. Extraire TOUTES les informations
    const fullName = extractFullName(rawText);
    console.log('📝 Nom extrait:', fullName);

    const competences = extractAllSkills(rawText);
    console.log('🔧 Compétences trouvées:', competences.length);

    const experiences = extractExperiences(rawText);
    console.log('💼 Expériences trouvées:', experiences.length);

    const formations = extractEducation(rawText);
    console.log('🎓 Formations trouvées:', formations.length);

    const emails = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones = rawText.match(/(?:\+33|0)[1-9](?:[-.\s]?\d{2}){4}/g) || [];
    
    const annees_experience = calculateTotalExperience(experiences);
    console.log('⏳ Années d\'expérience:', annees_experience);

    // Liste des diplômes classés par niveau (du plus bas au plus haut)
const DIPLOMES_HIERARCHIE = [
  { nom: 'sans diplôme', niveau: 0, motsCles: ['sans diplôme', 'aucun diplôme', 'sans formation'] },
  { nom: 'CAP', niveau: 1, motsCles: ['cap', 'certificat d\'aptitude professionnelle'] },
  { nom: 'BEP', niveau: 2, motsCles: ['bep', 'brevet d\'études professionnelles'] },
  { nom: 'Bac Pro', niveau: 3, motsCles: ['bac pro', 'baccalauréat professionnel'] },
  { nom: 'Bac', niveau: 4, motsCles: ['bac', 'baccalauréat', 'bac général', 'bac technologique'] },
  { nom: 'Bac+1', niveau: 5, motsCles: ['bac+1', 'mention complémentaire', 'mc'] },
  { nom: 'Bac+2', niveau: 6, motsCles: ['bac+2', 'bts', 'dut', 'deust'] },
  { nom: 'Bac+3', niveau: 7, motsCles: ['bac+3', 'licence', 'licence pro', 'bachelor'] },
  { nom: 'Bac+4', niveau: 8, motsCles: ['bac+4', 'maîtrise', 'master 1', 'm1'] },
  { nom: 'Bac+5', niveau: 9, motsCles: ['bac+5', 'master 2', 'master', 'diplôme d\'ingénieur', 'diplôme de grande école', 'm2'] },
  { nom: 'Bac+6', niveau: 10, motsCles: ['bac+6', 'mastère spécialisé', 'ms'] },
  { nom: 'Bac+8', niveau: 12, motsCles: ['bac+8', 'doctorat', 'phd', 'thèse'] }
];

    /**
 * Extrait les diplômes du texte et retourne le plus haut niveau trouvé.
 * @param {string} text - Texte brut du CV.
 * @returns {string|null} - Le plus haut niveau d'étude (ex: "Bac+5").
 */
function extractHighestDiploma(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  let highestDiploma = null;
  let highestLevel = -1;

  // Convertir le texte en minuscules pour une recherche insensible à la casse
  const lowerText = text.toLowerCase();

  for (const diploma of DIPLOMES_HIERARCHIE) {
    for (const keyword of diploma.motsCles) {
      if (lowerText.includes(keyword)) {
        if (diploma.niveau > highestLevel) {
          highestLevel = diploma.niveau;
          highestDiploma = diploma.nom;
        }
        break; // Passer au diplôme suivant une fois trouvé
      }
    }
  }

  return highestDiploma;
}


    // 4. Extraire le nom et prénom
    let nom = null;
    let prenom = null;
    
    if (fullName) {
      const nameParts = fullName.split(' ');
      if (nameParts.length >= 2) {
        prenom = nameParts[0];
        nom = nameParts.slice(1).join(' ');
      } else {
        nom = fullName;
      }
    }

    // 5. Extraire le profil (premières lignes significatives)
    let profil = null;
    const lines = rawText.split('\n').filter(l => l.trim().length > 20);
    if (lines.length > 0) {
      profil = lines.slice(0, 3).join(' ').substring(0, 500);
    }

    // 6. Construire la réponse
    const response = {
      success: true,
      candidateInfo: {
        // Informations personnelles
        nom: nom,
        prenom: prenom,
        nom_complet: fullName,
        email: emails[0] || null,
        telephone: phones[0] || null,
        adresse: null,
        
        // Profil professionnel
        profil: profil,
        metiers: competences.includes('ERP') ? 'Chef de Projet ERP' : null,
        postes: experiences.map(e => e.poste).filter(Boolean),
        entreprise: experiences[0]?.entreprise || null,
        
        // Compétences et expériences
        competences: competences,
        experiences: experiences,
        formations: formations,
        linkedin: null,
        lien: null,
        
        // Niveau et expérience
        //niveau: formations[0]?.diplome || null,
        niveau: extractHighestDiploma(cleanTextContent),
        annees_experience: annees_experience,
        
        // Métadonnées
        cv_filename: filePath.split('/').pop(),
        cv_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/truthtalent/${filePath}`,
        file_hash: fileHash,
        raw_text: rawText.substring(0, 5000),
        
        // Statistiques
        confidence_score: 0.85
      }
    };

    console.log('✅ Analyse terminée avec succès');
    console.log('📊 RÉSUMÉ FINAL:', {
      nom: response.candidateInfo.nom,
      prenom: response.candidateInfo.prenom,
      email: response.candidateInfo.email,
      competences: response.candidateInfo.competences.length,
      competences_liste: response.candidateInfo.competences.slice(0, 10),
      experiences: response.candidateInfo.experiences.length,
      formations: response.candidateInfo.formations.length,
      annees_experience: response.candidateInfo.annees_experience
    });

    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Erreur analyse:', error);
    res.status(500).json({
      error: error.message,
      details: "Erreur lors de l'analyse du CV"
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API d\'analyse de CV opérationnelle',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});