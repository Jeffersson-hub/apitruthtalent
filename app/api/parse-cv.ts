// pages/api/parse-cv.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { parseCV, ParseCVResult } from '../../services/documentParser';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file_url, filename, candidat_id, job_id } = req.body;

    if (!file_url) {
      return res.status(400).json({ error: 'file_url is required' });
    }

    // 1. Télécharger le fichier
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    const arrayBuffer = await fileResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Déterminer le type de fichier
    const fileType = filename.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : filename.toLowerCase().endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/octet-stream';

    // 3. Parser le CV
    const result: ParseCVResult = await parseCV(buffer, filename, fileType);

    // 4. Mettre à jour la base de données si candidat_id fourni
    if (candidat_id) {
      try {
        const updateData: any = {
          // Informations personnelles
          nom: result.candidat.nom,
          prenom: result.candidat.prenom,
          email: result.candidat.email,
          telephone: result.candidat.telephone,
          
          // Profil professionnel
          poste_actuel: result.candidat.poste,
          entreprise_actuelle: result.candidat.entreprise,
          profil: result.candidat.profil,
          niveau_etude: result.candidat.niveau_etude,
          niveau_experience: result.candidat.niveau_experience,
          annees_experience: result.candidat.annees_experience,
          
          // Compétences
          competences: result.candidat.competences,
          metiers: result.candidat.metiers,
          soft_skills: result.candidat.soft_skills,
          langues: result.candidat.langues,
          
          // Parcours
          experiences: result.candidat.experiences,
          formations: result.candidat.formations,
          certifications: result.candidat.certifications,
          projets: result.candidat.projets,
          
          // Aspects pratiques
          salaire_actuel: result.candidat.salaire_actuel,
          salaire_souhaite: result.candidat.salaire_souhaite,
          disponibilite: result.candidat.disponibilite,
          mobilite: result.candidat.mobilite,
          
          // Contact supplémentaires
          linkedin: result.candidat.linkedin,
          github: result.candidat.github,
          portfolio: result.candidat.portfolio,
          
          // Métadonnées
          confidence_score: result.confidence_score,
          parse_status: 'completed',
          updated_at: new Date().toISOString(),
          raw_text: result.raw_text,
          metadata: result.metadata
        };

        // Filtrer les valeurs undefined
        
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key];
          }
        });

        if (Object.keys(updateData).length > 0) {
          await supabase
            .from('candidats')
            .update(updateData)
            .eq('id', candidat_id);
        }

        // Mettre à jour le job si job_id fourni
        if (job_id) {
          await supabase
            .from('parse_jobs')
            .update({
              status: 'completed',
              extracted_data: result.candidat,
              confidence_score: result.confidence_score,
              raw_text: result.raw_text,
              metadata: result.metadata,
              updated_at: new Date().toISOString()
            })
            .eq('id', job_id);
        }

      } catch (dbError) {
        console.error('Database error:', dbError);
      }
    }

    // 5. Retourner la réponse complète
    return res.status(200).json({
      success: true,
      data: result.candidat,
      confidence_score: result.confidence_score,
      raw_text: result.raw_text,
      metadata: result.metadata,
      job_id,
      candidat_id
    });

  } catch (error: any) {
    console.error('Parse CV error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to parse CV'
    });
  }
}