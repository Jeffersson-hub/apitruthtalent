// app/api/parse/route.ts - VERSION CORRIGÉE POUR multipart/form-data
import { NextRequest, NextResponse } from 'next/server';
import { parseCV } from '../../../services/documentParser';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    console.log('🧠 API Parse: Début traitement');
    
    // Vérifier l'API key
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.WEBHOOK_SECRET || 'truth-talent-secret-2024';
    
    if (apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      );
    }
    
    // Récupérer FormData
    const formData = await request.formData();
    
    // Extraire les données
    const file_url = formData.get('file_url') as string;
    const file_path = formData.get('file_path') as string;
    const filename = formData.get('filename') as string;
    const job_id = formData.get('job_id') as string;
    const candidat_id = formData.get('candidat_id') as string;
    const offer_id = formData.get('offer_id') as string;
    const candidate_email = formData.get('candidate_email') as string;
    
    console.log('📥 Données reçues:', {
      file_url,
      filename,
      job_id,
      candidat_id
    });
    
    // Validation
    if (!file_url) {
      return NextResponse.json(
        { error: 'file_url requis' },
        { status: 400 }
      );
    }
    
    // 1. Télécharger le fichier
    console.log('📥 Téléchargement du fichier...', file_url);
    
    const response = await fetch(file_url);
    if (!response.ok) {
      throw new Error(`Erreur téléchargement: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Déterminer le type de fichier
    const fileType = filename.toLowerCase().endsWith('.pdf') 
      ? 'application/pdf' 
      : filename.toLowerCase().endsWith('.docx') 
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/octet-stream';
    
    // 2. Parser le CV
    console.log('🔍 Parsing du CV...');
    const result = await parseCV(buffer, filename, fileType);
    
    console.log('✅ Parsing réussi:', {
      candidat_id,
      competences: result.candidat.competences?.length,
      metiers: result.candidat.metiers?.length,
      confidence: result.confidence_score
    });
    
    // 3. Mettre à jour la base de données si candidat_id fourni
    if (candidat_id) {
      try {
        const updateData: any = {};
        
        if (result.candidat.nom) updateData.nom = result.candidat.nom;
        if (result.candidat.prenom) updateData.prenom = result.candidat.prenom;
        if (result.candidat.email) updateData.email = result.candidat.email;
        if (result.candidat.telephone) updateData.telephone = result.candidat.telephone;
        if (result.candidat.poste) updateData.poste_actuel = result.candidat.poste;
        if (result.candidat.entreprise) updateData.entreprise_actuelle = result.candidat.entreprise;
        if (result.candidat.competences) updateData.competences = result.candidat.competences;
        if (result.candidat.metiers) updateData.metiers = result.candidat.metiers;
        if (result.candidat.annees_experience) updateData.annees_experience = result.candidat.annees_experience;
        if (result.candidat.experiences) updateData.experiences = result.candidat.experiences;
        if (result.candidat.formations) updateData.formations = result.candidat.formations;
        if (result.candidat.langues) updateData.langues = result.candidat.langues;
        
        updateData.confidence_score = result.confidence_score;
        updateData.parse_status = 'completed';
        updateData.updated_at = new Date().toISOString();
        
        // Ne mettre à jour que les champs qui ont des valeurs
        if (Object.keys(updateData).length > 0) {
          await supabase
            .from('candidats')
            .update(updateData)
            .eq('id', candidat_id);
          
          console.log('✅ Candidat mis à jour dans Supabase');
        }
        
        // Mettre à jour le job
        await supabase
          .from('parse_jobs')
          .update({
            status: 'completed',
            extracted_data: result.candidat,
            confidence_score: result.confidence_score,
            updated_at: new Date().toISOString()
          })
          .eq('id', job_id);
          
      } catch (dbError) {
        console.error('❌ Erreur DB:', dbError);
        // Continuer même si DB échoue
      }
    }
    
    // 4. Retourner le résultat
    return NextResponse.json({
      success: true,
      data: result.candidat,
      confidence_score: result.confidence_score,
      job_id,
      candidat_id,
      message: 'CV analysé avec succès'
    });
    
  } catch (error: any) {
    console.error('❌ API Parse Error:', error);
    
    // Mettre à jour le job en erreur si job_id est disponible
    try {
      const formData = await request.formData();
      const job_id = formData.get('job_id') as string;
      
      if (job_id) {
        await supabase
          .from('parse_jobs')
          .update({
            status: 'failed',
            error: error.message || 'Erreur parsing',
            updated_at: new Date().toISOString()
          })
          .eq('id', job_id);
      }
    } catch (e) {
      // Ignorer les erreurs de mise à jour
    }
    
    return NextResponse.json(
      { 
        error: error.message || 'Erreur interne',
        success: false 
      },
      { status: 500 }
    );
  }
}

// Health endpoint
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'CV Parser API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoint: 'POST /api/parse (multipart/form-data)',
    required_fields: ['file_url', 'filename', 'job_id']
  });
}