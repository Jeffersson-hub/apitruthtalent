import { NextRequest, NextResponse } from 'next/server';
import { parseCV } from '../../../services/documentParser';
import type Candidat from '../../../types/candidats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Type pour le résultat du parsing - ajusté selon votre interface Candidat
interface ParseResult {
  candidat: Candidat;
  confidence_score: number;
  raw_text?: string;
  metadata?: {
    filename: string;
    file_type: string;
    extraction_date: string;
    [key: string]: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'Aucun fichier fourni' },
        { status: 400 }
      );
    }
    
    // Vérification du type de fichier
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { 
          error: 'Type de fichier non supporté. Formats acceptés: PDF, DOC, DOCX, TXT' 
        },
        { status: 400 }
      );
    }
    
    // Lire en ArrayBuffer, puis convertir en Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Appeler le service de parsing
    const result = await parseCV(buffer, file.name, file.type) as ParseResult;
    
    // S'assurer que les champs obligatoires sont définis
    const candidatData: Candidat = {
      fichier: file.name,
      nom: result.candidat.nom || null,
      prenom: result.candidat.prenom || null,
      email: result.candidat.email || null,
      telephone: result.candidat.telephone || null,
      poste: result.candidat.poste || null,
      entreprise: result.candidat.entreprise || null,
      profil: result.candidat.profil || null,
      competences: result.candidat.competences || [],
      metiers: result.candidat.metiers || [],
      experiences: result.candidat.experiences || [],
      formations: result.candidat.formations || [],
      langues: result.candidat.langues || [],
      adresse: result.candidat.adresse || null,
      linkedin: result.candidat.linkedin || null,
      niveau: result.candidat.niveau || null,
      confidence_score: result.confidence_score,
      
      // Champs optionnels
      annees_experience: result.candidat.annees_experience,
      cv_filename: file.name,
      date_extraction: new Date().toISOString(),
      file_type: file.type,
      raw_text: result.raw_text,
      // ... autres champs optionnels si disponibles
    };
    
    return NextResponse.json({
      success: true,
      data: candidatData,
      filename: file.name,
      confidence: result.confidence_score,
      metadata: result.metadata
    });
    
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Erreur interne du serveur',
        success: false 
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}