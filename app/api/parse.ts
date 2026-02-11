// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/supabase';
import type Candidat from '../../types/candidats';
import { parseCV } from '../../services/documentParser';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // 1. Récupérer le JSON envoyé par Parseur
    const { candidat, confidence_score, filename } = req.body;

    // 2. Vérifier que les données sont valides
    if (!candidat || !filename) {
      return res.status(400).json({ error: 'Données manquantes' });
    }

    // 3. Vérifier si le candidat existe déjà
    const { data: existing } = await supabase
      .from('candidats')
      .select('id')
      .eq('fichier', filename)
      .maybeSingle();

    if (!existing) {
      // 4. Insérer les données dans Supabase
      const { error: dbError } = await supabase
        .from('candidats')
        .insert([{
          ...candidat,
          fichier: filename,
          confidence_score,
          extraction_date: new Date().toISOString(),
        }]);

      if (dbError) {
        console.error('Erreur insertion BD:', dbError);
        return res.status(500).json({ error: 'Erreur base de données' });
      }

      return res.status(200).json({ success: true, message: 'Candidat inséré' });
    } else {
      return res.status(200).json({ success: true, message: 'Candidat déjà en base' });
    }
  } catch (e) {
    console.error('Erreur globale:', e);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}


function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'txt': 'text/plain'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}