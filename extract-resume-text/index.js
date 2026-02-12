const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const comprehend = new AWS.Comprehend({ region: "ap-south-1" });
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const natural = require("natural");
const tokenizer = new natural.WordTokenizer();
require('dotenv').config();

// Initialize TF-IDF for better keyword extraction
const TfIdf = natural.TfIdf;
const tfidf = new TfIdf();

// Common technical skills database
const technicalSkills = new Set([
  // Programming Languages
  "JavaScript", "Python", "Java", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "Go", "Rust",
  // Web Technologies
  "HTML", "CSS", "React", "Angular", "Vue", "Node.js", "Express", "Django", "Flask", "Spring",
  // Databases
  "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "Oracle", "SQLite",
  // Cloud & DevOps
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Jenkins", "CI/CD",
  // Data Science
  "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "NumPy", "R",
  // Mobile
  "Android", "iOS", "React Native", "Flutter",
  // Other
  "Git", "Linux", "Agile", "Scrum", "REST", "GraphQL", "Microservices"
]);

// Soft skills database
const softSkills = new Set([
  "Communication", "Leadership", "Teamwork", "Problem Solving", "Time Management",
  "Adaptability", "Creativity", "Critical Thinking", "Emotional Intelligence",
  "Project Management", "Negotiation", "Conflict Resolution"
]);

exports.handler = async (event) => {
  const bucket = event.bucket;
  const key = event.key;

  try {
    // Validate input
    if (!bucket || !key) {
      throw new Error("Missing required parameters: bucket and key");
    }

    const jobDescription = event.jobDescription || "";

    // Get file from S3
    const s3Object = await s3.getObject({ Bucket: bucket, Key: key }).promise();
    const buffer = s3Object.Body;

    let extractedText = "";

    // Extract text based on file type
    if (key.endsWith(".pdf")) {
      const data = await pdfParse(buffer);
      extractedText = data.text;
    } else if (key.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Unsupported file type. Only PDF and DOCX are supported." }),
      };
    }

    // Clean and prepare text
    const cleanText = extractedText.replace(/\s+/g, " ").trim();
    const textForComprehend = cleanText.slice(0, 5000);

    // AWS Comprehend analysis with error handling
    let keyPhrasesResult, entitiesResult, sentimentResult;
    try {
      [keyPhrasesResult, entitiesResult, sentimentResult] = await Promise.all([
        comprehend.detectKeyPhrases({ LanguageCode: "en", Text: textForComprehend }).promise(),
        comprehend.detectEntities({ LanguageCode: "en", Text: textForComprehend }).promise(),
        comprehend.detectSentiment({ LanguageCode: "en", Text: textForComprehend }).promise()
      ]);
    } catch (comprehendError) {
      console.error("AWS Comprehend error:", comprehendError);
      // Continue with basic analysis if Comprehend fails
      keyPhrasesResult = { KeyPhrases: [] };
      entitiesResult = { Entities: [] };
      sentimentResult = { Sentiment: "NEUTRAL" };
    }

    // Enhanced keyword extraction using TF-IDF
    tfidf.addDocument(cleanText);
    const importantKeywords = new Set();
    tfidf.listTerms(0).forEach(item => {
      if (item.tfidf > 0.1) {
        importantKeywords.add(item.term);
      }
    });

    // Extract skills using NLP
    const tokens = tokenizer.tokenize(cleanText);
    const foundTechnicalSkills = new Set();
    const foundSoftSkills = new Set();

    tokens.forEach(token => {
      const normalizedToken = token.toLowerCase();
      technicalSkills.forEach(skill => {
        if (skill.toLowerCase().includes(normalizedToken) || 
            normalizedToken.includes(skill.toLowerCase())) {
          foundTechnicalSkills.add(skill);
        }
      });
      softSkills.forEach(skill => {
        if (skill.toLowerCase().includes(normalizedToken) || 
            normalizedToken.includes(skill.toLowerCase())) {
          foundSoftSkills.add(skill);
        }
      });
    });

    // Analyze job description for required skills
    const jdTokens = tokenizer.tokenize(jobDescription);
    const requiredSkills = new Set();
    
    jdTokens.forEach(token => {
      const normalizedToken = token.toLowerCase();
      technicalSkills.forEach(skill => {
        if (skill.toLowerCase().includes(normalizedToken) || 
            normalizedToken.includes(skill.toLowerCase())) {
          requiredSkills.add(skill);
        }
      });
    });

    // Calculate skill match percentage
    const missingSkills = Array.from(requiredSkills).filter(skill => !foundTechnicalSkills.has(skill));
    const skillMatchPercentage = requiredSkills.size > 0 
      ? Math.round((foundTechnicalSkills.size / requiredSkills.size) * 100)
      : 0;

    // Generate job suggestions
    const jobSuggestions = generateJobSuggestions(foundTechnicalSkills);
    const candidateInfo = extractCandidateInfo(cleanText);
    const sections = sectionizeResume(cleanText);
    const workExperienceAnalysis = analyzeWorkExperience(sections.experience);
    const readabilityAnalysis = analyzeReadability(cleanText);

    // Prepare response
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        wordCount: cleanText.split(/\s+/).length,
        summary: cleanText.slice(0, 300) + "...",
        keyPhrases: keyPhrasesResult.KeyPhrases,
        entities: entitiesResult.Entities,
        sentiment: sentimentResult.Sentiment,
        ats: {
          score: `${skillMatchPercentage}%`,
          missingKeywords: missingSkills,
          foundKeywords: Array.from(requiredSkills).filter(skill => foundTechnicalSkills.has(skill))
        },
        skills: {
          technical: Array.from(foundTechnicalSkills),
          soft: Array.from(foundSoftSkills),
          matchPercentage: `${skillMatchPercentage}%`,
          missing: missingSkills
        },
        importantKeywords: Array.from(importantKeywords),
        jobSuggestions: jobSuggestions,
        skillsGap: {
          missingSkills: missingSkills,
          suggestedImprovements: Array.from(requiredSkills).filter(skill => !foundTechnicalSkills.has(skill))
        },
        candidateInfo: candidateInfo,
        sections: sections,
        workExperienceAnalysis: workExperienceAnalysis,
        readabilityAnalysis: readabilityAnalysis
      })
    };

    return response;
  } catch (error) {
    console.error("Lambda error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        errorMessage: error.message || "Failed to process resume.",
        errorType: error.name || "UnknownError"
      })
    };
  } finally {
    // Delete the file from S3 after processing
    if (bucket && key) {
      try {
        await s3.deleteObject({ Bucket: bucket, Key: key }).promise();
        console.log(`Successfully deleted ${key} from ${bucket}`);
      } catch (deleteError) {
        console.error(`Error deleting ${key} from ${bucket}:`, deleteError);
      }
    }
  }
};

// Helper function to extract candidate information
function extractCandidateInfo(text) {
  const nameRegex = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/;
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
  const phoneRegex = /(\d{3}[-.]?\d{3}[-.]?\d{4})/; 

  const nameMatch = text.match(nameRegex);
  const emailMatch = text.match(emailRegex);
  const phoneMatch = text.match(phoneRegex);

  return {
    name: nameMatch ? nameMatch[0].trim() : null,
    email: emailMatch ? emailMatch[0].trim() : null,
    phone: phoneMatch ? phoneMatch[0].trim() : null
  };
}

// Helper function to sectionize the resume
function sectionizeResume(text) {
  const sections = {};
  const lines = text.split('\n');
  let currentSection = 'header';
  sections[currentSection] = [];

  const sectionKeywords = {
    summary: /^summary$/i,
    experience: /^experience$|^work experience$|^professional experience$/i,
    education: /^education$/i,
    skills: /^skills$|^technical skills$/i,
    projects: /^projects$/i,
    certifications: /^certifications$/i,
    awards: /^awards$|^honors and awards$/i,
    publications: /^publications$/i,
    references: /^references$/i
  };

  lines.forEach(line => {
    let isSectionHeader = false;
    for (const [section, regex] of Object.entries(sectionKeywords)) {
      if (regex.test(line.trim())) {
        currentSection = section;
        sections[currentSection] = [];
        isSectionHeader = true;
        break;
      }
    }

    if (!isSectionHeader) {
      sections[currentSection].push(line.trim());
    }
  });

  return sections;
}

// Helper function to analyze work experience
function analyzeWorkExperience(experienceText) {
  if (!experienceText) {
    return {
      feedback: "Work experience section not found.",
      actionVerbCheck: [],
      quantifiableCheck: []
    };
  }

  const actionVerbs = ["achieved", "accelerated", "accomplished", "acquired", "adapted", "administered", "advised", "advocated", "analyzed", "authored", "automated", "balanced", "budgeted", "built", "calculated", "centralized", "chaired", "clarified", "collaborated", "conceived", "conceptualized", "conducted", "consolidated", "constructed", "consulted", "converted", "coordinated", "counseled", "created", "cultivated", "cut", "decreased", "defined", "delegated", "delivered", "demonstrated", "designed", "developed", "devised", "directed", "discovered", "doubled", "drove", "edited", "eliminated", "enabled", "encouraged", "engineered", "enhanced", "ensured", "established", "evaluated", "executed", "expanded", "expedited", "explained", "facilitated", "forecasted", "formulated", "founded", "generated", "governed", "guided", "halved", "headed", "identified", "implemented", "improved", "incorporated", "increased", "initiated", "inspired", "instituted", "instructed", "integrated", "interpreted", "introduced", "invented", "launched", "led", "lectured", "licensed", "lobbied", "maintained", "managed", "marketed", "mastered", "mentored", "merged", "modernized", "motivated", "navigated", "negotiated", "operated", "orchestrated", "organized", "overhauled", "oversaw", "partnered", "perfected", "performed", "pioneered", "planned", "predicted", "prepared", "presented", "presided", "prioritized", "produced", "programmed", "promoted", "proposed", "proved", "provided", "published", "quadrupled", "quantified", "raised", "ran", "ranked", "rated", "received", "recommended", "reconciled", "recruited", "redesigned", "reduced", "refined", "regained", "rehabilitated", "reinforced", "rejuvenated", "related", "remodeled", "reorganized", "repaired", "replaced", "reported", "represented", "researched", "resolved", "responded", "restored", "restructured", "retrieved", "revamped", "revitalized", "revolutionized", "saved", "scheduled", "secured", "selected", "served", "serviced", "shaped", "simplified", "slashed", "solidified", "solved", "sparked", "spearheaded", "specified", "spoke", "sponsored", "staffed", "standardized", "steered", "stimulated", "streamlined", "strengthened", "structured", "studied", "submitted", "substituted", "succeeded", "summarized", "supervised", "supported", "surpassed", "surveyed", "synthesized", "systematized", "tabulated", "taught", "tested", "trained", "transcribed", "transformed", "translated", "tripled", "troubleshot", "tutored", "unified", "united", "unraveled", "updated", "upgraded", "utilized", "validated", "verbalized", "verified", "visualized", "won", "wrote"];
  const bulletPoints = experienceText.map(line => line.trim()).filter(line => line.length > 0);
  const actionVerbCheck = [];
  const quantifiableCheck = [];

  bulletPoints.forEach(bullet => {
    const firstWord = bullet.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    if (!actionVerbs.includes(firstWord)) {
      actionVerbCheck.push({ bullet: bullet, feedback: `Consider starting with a strong action verb instead of '${firstWord}'.` });
    }

    if (!/\d/.test(bullet)) {
      quantifiableCheck.push({ bullet: bullet, feedback: "Consider adding quantifiable achievements (e.g., numbers, percentages) to show impact." });
    }
  });

  return {
    actionVerbCheck: actionVerbCheck,
    quantifiableCheck: quantifiableCheck
  };
}

// Helper function to analyze readability
function analyzeReadability(text) {
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).length;
  const pages = Math.ceil(words / 250);
  const longSentences = text.split(/[.!?]+/).filter(sentence => sentence.split(/\s+/).length > 25).length;

  const feedback = [];

  if (pages > 2) {
    feedback.push(`Your resume is ${pages} pages long. Consider shortening it to 1-2 pages.`);
  }

  if (longSentences > 0) {
    feedback.push(`You have ${longSentences} long sentences. Consider shortening them for better readability.`);
  }

  return {
    pages: pages,
    longSentences: longSentences,
    feedback: feedback
  };
}


// Helper function to generate job suggestions based on skills
function generateJobSuggestions(skills) {
  const jobCategories = {
    "Software Development": {
      required: ["JavaScript", "Python", "Java", "C++", "SQL"],
      optional: ["React", "Node.js", "Git", "Agile"]
    },
    "Data Science": {
      required: ["Python", "SQL", "Machine Learning"],
      optional: ["R", "Pandas", "TensorFlow", "Data Visualization"]
    },
    "DevOps": {
      required: ["AWS", "Docker", "Linux"],
      optional: ["Kubernetes", "CI/CD", "Terraform"]
    }
  };

  const suggestions = [];
  for (const [title, requirements] of Object.entries(jobCategories)) {
    const requiredMatch = requirements.required.filter(skill => skills.has(skill)).length;
    const optionalMatch = requirements.optional.filter(skill => skills.has(skill)).length;
    const matchScore = (requiredMatch / requirements.required.length) * 0.7 + 
                      (optionalMatch / requirements.optional.length) * 0.3;
    
    if (matchScore > 0.3) {
      suggestions.push({
        title,
        matchScore: Math.round(matchScore * 100),
        missingRequired: requirements.required.filter(skill => !skills.has(skill)),
        matchingSkills: [...requirements.required, ...requirements.optional].filter(skill => skills.has(skill))
      });
    }
  }

  return suggestions.sort((a, b) => b.matchScore - a.matchScore).slice(0, 3);
}
