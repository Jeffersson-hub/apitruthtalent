import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import { supabase } from '../../utils/supabase';
import { sha256 } from '../../utils/hash';

export const config = {
  api: {
    bodyParser: false,
  },
};

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Endpoint d'upload :
 * - reçoit le fichier (field "file")
 * - calcule un hash
 * - upload dans Supabase Storage
 * - crée une entrée candidats minimale si absent
 * - crée un job dans la table jobs
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse multipart with multer
  await new Promise<void>((resolve, reject) => {
    // @ts-ignore - adapter pour Next.js
    upload.single('file')(req as any, {} as any, (err: any) => (err ? reject(err) : resolve()));
  });

  try {
    // @ts-ignore
    const file = (req as any).file as Express.Multer.File | undefined;
    const { email, nom, prenom } = req.body || {};

    if (!file) {
      return res.status(400).json({ success: false, error: 'Fichier manquant (field "file")' });
    }

    console.log(`📥 Nouveau CV reçu: ${file.originalname}`);

    // 1) Calculer hash pour déduplication
    const fileHash = sha256(file.buffer);

    // 2) Vérifier si candidat déjà présent selon le hash (si colonne ajoutée)
    const { data: existingByHash } = await supabase
      .from('candidats')
      .select('id')
      .eq('file_hash', fileHash)
      .maybeSingle();

    if (existingByHash) {
      console.log('ℹ️ CV déjà présent en base (hash)', existingByHash.id);
      return res.status(200).json({
        success: true,
        message: 'CV déjà traité (hash)',
        candidat_id: existingByHash.id
      });
    }

    // 3) Upload vers Supabase Storage
    const filename = `${Date.now()}-${file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('truthtalent')
      .upload(`cvs/${filename}`, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Erreur upload Supabase: ${uploadError.message}`);
    }

    // Récupérer l'URL publique
    const { data: urlData } = await supabase.storage
      .from('truthtalent')
      .getPublicUrl(uploadData.path);

    const fileUrl = urlData.publicUrl;

    // 4) Créer ou récupérer la ligne candidat (fichier unique contraint)
    // On tente d'insérer; si contrainte unique triggera erreur, on lit l'existant
    const candidateData: any = {
      fichier: filename,
      cv_filename: file.originalname,
      cv_url: fileUrl,
      file_hash: fileHash,
      date_upload: new Date().toISOString(),
      nom: nom || null,
      prenom: prenom || null,
      email: email || null,
      annees_experience: 0
    };

    // Tentative d'insertion
    const { data: candidat, error: insertError } = await supabase
      .from('candidats')
      .insert(candidateData)
      .select()
      .single();

    let candidatId: number | null = null;
    if (insertError) {
      // Si doublon sur fichier -> récupérer l'enregistrement existant
      console.warn('⚠️ Insert candidat a échoué (peut être doublon), lecture existant', insertError.message);
      const { data: existingByFilename } = await supabase
        .from('candidats')
        .select('id')
        .eq('fichier', filename)
        .maybeSingle();
      candidatId = existingByFilename?.id || null;
    } else {
      candidatId = candidat?.id || null;
    }

    // 5) Créer un job pour traitement asynchrone
    const jobPayload: any = {
      files: [fileUrl],
      file_hash: fileHash,
      status: 'pending',
      created_at: new Date().toISOString(),
      candidat_id: candidatId,
      processed: 0
    };

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert(jobPayload)
      .select()
      .single();

    if (jobError) {
      throw jobError;
    }

    console.log(`✅ Upload OK — job créé: ${job.id}`);

    return res.status(200).json({
      success: true,
      candidat_id: candidatId,
      job_id: job.id,
      message: 'CV reçu et job créé'
    });

  } catch (error: any) {
    console.error('❌ Erreur upload CV:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}