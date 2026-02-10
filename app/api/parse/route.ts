// pages/api/parse/route.ts
import { NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import * as mammoth from 'mammoth';
import nlp from 'compromise';
import natural from 'natural';
import { chrono } from 'chrono-node';
import Fuse from 'fuse.js';

// Types pour les données extraites
interface Candidat {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  competences: string[];
  experiences: Array<{
    periode: string;
    poste: string;
    entreprise: string;
  }>;
  formations: Array<{
    periode: string;
    diplome: string;
    etablissement: string;
  }>;
  raw_text: string;
}

export async function POST(request: Request) {
  try {
    // 1. Vérification de la clé API
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.WEBHOOK_SECRET || 'truth-talent-secret-2024';
    if (apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    // 2. Lecture du corps de la requête
    const { file_url, candidat_id, candidate_name, candidate_email } = await request.json();
    if (!file_url || !candidat_id) {
      return NextResponse.json(
        { error: 'file_url et candidat_id sont requis' },
        { status: 400 }
      );
    }

    // 3. Télécharger le fichier
    const response = await fetch(file_url);
    if (!response.ok) {
      throw new Error(`Échec du téléchargement: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Extraire le texte selon le type de fichier
    let rawText = '';
    const fileType = file_url.endsWith('.pdf')
      ? 'application/pdf'
      : file_url.endsWith('.docx')
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain';

    if (fileType === 'application/pdf') {
      const pdfData = await pdf(buffer);
      rawText = pdfData.text;
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    } else {
      rawText = buffer.toString('utf8');
    }

    // 5. Extraire les données avec les bibliothèques NLP
    const candidat: Candidat = {
      nom: extractNom(rawText, candidate_name),
      prenom: extractPrenom(rawText),
      email: extractEmail(rawText, candidate_email),
      telephone: extractTelephone(rawText),
      competences: extractCompetences(rawText),
      experiences: extractExperiences(rawText),
      formations: extractFormations(rawText),
      raw_text: rawText.substring(0, 5000)
    };

    // 6. Répondre avec les données extraites
    return NextResponse.json({
      success: true,
      data: candidat,
      message: 'CV analysé avec succès'
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return NextResponse.json(
      { error: 'Erreur interne', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// Fonctions d'extraction
function extractNom(text: string, defaultName: string): string {
  const doc = nlp(text);
  const people = doc.people().out('array');
  return people[0] || defaultName.split(' ')[0] || 'Inconnu';
}

function extractPrenom(text: string): string {
  const doc = nlp(text);
  const people = doc.people().out('array');
  return people.length > 1 ? people[1] : '';
}

function extractEmail(text: string, defaultEmail: string): string {
  const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
  return emailMatch ? emailMatch[0] : defaultEmail;
}

function extractTelephone(text: string): string {
  const phoneMatch = text.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g);
  return phoneMatch ? phoneMatch[0] : '';
}


function extractCompetences(text: string): string[] {
  const doc = nlp(text);
  const skills = doc.match('#Verb? #Adjective? (#Noun+){1,3}').out('array');
  const skillKeywords = ['javascript', 'react', 'node', 'php', 'python', 'java', 'sql', 'aws', 'docker'];
  return skills.filter((skill: string) =>
    skillKeywords.some(keyword => skill.toLowerCase().includes(keyword))
  );
}

function extractExperiences(text: string): Array<{ periode: string; poste: string; entreprise: string }> {
  const experienceRegex = /(?:\d{4}\s*[-–]\s*\d{4}|de\s+\d{4}\s*à\s*\d{4})\s*:?\s*(.*?)(?:chez|@|at)\s*(.*?)(?=\n\d{4}|$)/g;
  const experiences = [];
  let match;
  while ((match = experienceRegex.exec(text)) !== null) {
    experiences.push({
      periode: match[1].trim(),
      poste: match[2].trim(),
      entreprise: match[3].trim()
    });
  }
  return experiences;
}

function extractFormations(text: string): Array<{ periode: string; diplome: string; etablissement: string }> {
  const formationRegex = /(?:\d{4}\s*[-–]\s*\d{4})\s*:?\s*(.*?)(?:à|at)\s*(.*?)(?=\n\d{4}|$)/g;
  const formations = [];
  let match;
  while ((match = formationRegex.exec(text)) !== null) {
    formations.push({
      periode: match[1].trim(),
      diplome: match[2].trim(),
      etablissement: match[3].trim()
    });
  }
  return formations;
}
