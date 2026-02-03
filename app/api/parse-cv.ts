// pages/api/parse-cv.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { parseCV } from '../../services/documentParser';

// Configuration Supabase
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Vérifier la clé API
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { 
      file_url, 
      file_path,
      filename, 
      job_id, 
      candidat_id,
      offer_id,
      candidate_email,
      callback_url 
    } = req.body;

    if (!file_url || !job_id) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    console.log('🔍 Début parsing:', { filename, job_id });

    // 1. Télécharger le fichier
    const response = await fetch(file_url);
    if (!response.ok) {
      throw new Error(`Échec téléchargement: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // 2. Déterminer le type de fichier
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    // 3. Parser le CV
    const parseResult = await parseCV(buffer, filename, contentType);
    
    if (!parseResult || !parseResult.candidat) {
      throw new Error('Échec de l\'extraction des données');
    }

    const result = {
      ...parseResult.candidat,
      confidence_score: parseResult.confidence_score,
      raw_text: parseResult.raw_text?.substring(0, 5000),
      metadata: {
        ...parseResult.metadata,
        job_id,
        file_path,
        parsed_at: new Date().toISOString()
      }
    };

    // 4. Mettre à jour Supabase directement
    const updateData = {
      parse_status: 'completed',
      parse_result: result,
      parse_confidence: result.confidence_score,
      date_analyse: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Mettre à jour les champs extraits
      nom: result.nom || null,
      prenom: result.prenom || null,
      email: result.email || candidate_email || null,
      telephone: result.telephone || null,
      poste: result.poste || null,
      entreprise: result.entreprise || null,
      profil: result.profil || null,
      competences: result.competences || [],
      metiers: result.metiers || [],
      experiences: result.experiences || [],
      formations: result.formations || [],
      langues: result.langues || [],
      adresse: result.adresse || null,
      linkedin: result.linkedin || null,
      niveau: result.niveau || null,
      annees_experience: result.annees_experience || null,
      confidence_score: result.confidence_score,
      raw_text: result.raw_text || null,
    };

    // Utiliser l'ID du candidat si disponible, sinon chercher par fichier
    let updateCondition = {};
    if (candidat_id) {
      updateCondition = { id: candidat_id };
    } else if (file_path) {
      updateCondition = { fichier: file_path };
    }

    // Appeler l'API Supabase pour mettre à jour
    const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/candidats`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(updateData),
    });

    if (!supabaseResponse.ok) {
      console.error('❌ Erreur mise à jour Supabase:', await supabaseResponse.text());
    }

    // 5. Mettre à jour le job
    const jobUpdate = await fetch(`${SUPABASE_URL}/rest/v1/parse_jobs`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }),
    });

    // 6. Appeler le callback si fourni
    if (callback_url) {
      try {
        await fetch(callback_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id,
            success: true,
            candidat_id,
            result
          })
        });
      } catch (callbackError) {
        console.error('⚠️ Erreur callback:', callbackError);
      }
    }

    // 7. Répondre
    return res.status(200).json({
      success: true,
      job_id,
      message: 'CV parsé avec succès',
      confidence: parseResult.confidence_score
    });

  } catch (error: any) {
    console.error('💥 Erreur parsing:', error);
    
    // Mettre à jour le statut en échec
    try {
      const job_id = req.body.job_id;
      if (job_id) {
        await fetch(`${SUPABASE_URL}/rest/v1/parse_jobs`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'apikey': SUPABASE_SERVICE_KEY,
          },
          body: JSON.stringify({
            status: 'failed',
            error: error.message,
            completed_at: new Date().toISOString()
          }),
        });
      }
    } catch (updateError) {
      console.error('❌ Erreur mise à jour job:', updateError);
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur interne'
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};