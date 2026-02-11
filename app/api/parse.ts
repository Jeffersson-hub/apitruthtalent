// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/supabase';
import type Candidat from '../../types/candidats';
import { parseCV } from '../../services/documentParser';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "https://truthtalent.online"); 
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // 1️⃣ Lister les fichiers
    const { data: files, error: listError } = await supabase
      .storage
      .from('truthtalent')
      .list('cvs', { limit: 100 });

    if (listError) {
      return res.status(500).json({ 
        error: 'Erreur listage bucket', 
        details: listError.message 
      });
    }

    const results = [];

    for (const file of files || []) {
      const extension = file.name.toLowerCase().split('.').pop();
      const isSupported = ['pdf', 'docx', 'doc', 'txt'].includes(extension || '');
      
      if (!isSupported) continue;

      try {
        const fullPath = `cvs/${file.name}`;

        // Télécharger le fichier
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('truthtalent')
          .download(fullPath);

        if (downloadError || !fileData) throw new Error('Fichier inaccessible');

        // Convertir en Buffer
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Déterminer le type MIME
        const fileType = getMimeType(extension!);

        // 2️⃣ Extraire données du CV
        const parseResult = await parseCV(buffer, file.name, fileType);
        
        if (!parseResult || !parseResult.candidat) {
          throw new Error('Échec de l\'extraction');
        }

        const extracted = parseResult.candidat;

        // 3️⃣ Vérifier doublon
        const { data: existing } = await supabase
          .from('candidats')
          .select('id')
          .eq('fichier', file.name)
          .maybeSingle();

        if (!existing) {
          // Préparer les données pour l'insertion
          const candidatData = {
            nom: extracted.nom || null,
            prenom: extracted.prenom || null,
            email: extracted.email || null,
            telephone: extracted.telephone || null,
            poste: extracted.poste || null,
            entreprise: extracted.entreprise || null,
            adresse: extracted.adresse ? JSON.stringify(extracted.adresse) : null,
            competences: extracted.competences || [],
            metiers: extracted.metiers || [],
            experiences: extracted.experiences || [],
            formations: extracted.formations || [],
            langues: extracted.langues || [],
            profil: extracted.profil || null,
            fichier: file.name,
            cv_filename: file.name,
            confidence_score: parseResult.confidence_score,
            file_type: fileType,
            extraction_date: new Date().toISOString(),
            extraction_details: parseResult.extraction_details
          };

          // Insérer dans la base de données
          const { error: dbError } = await supabase
            .from('candidats')
            .insert([candidatData]);

          if (dbError) throw new Error(`Erreur BD: ${dbError.message}`);

          results.push({ 
            path: fullPath, 
            success: true,
            confidence: parseResult.confidence_score,
            details: parseResult.extraction_details
          });
        } else {
          results.push({ 
            path: fullPath, 
            success: false,
            error: 'Déjà en base' 
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        results.push({ 
          path: `cvs/${file.name}`, 
          success: false,
          error: msg 
        });
      }
    }

    return res.status(200).json({ 
      message: 'CV analysés', 
      total: files?.length || 0,
      processed: results.filter(r => r.success).length,
      errors: results.filter(r => !r.success).length,
      results 
    });
    
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Erreur inconnue';
    return res.status(500).json({ error: err });
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