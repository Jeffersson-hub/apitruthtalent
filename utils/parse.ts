// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../utils/supabase';
import type Candidat from '../types/candidats';
import { parseCV } from '../services/documentParser';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 🔹 Headers CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "https://truthtalent.online"); 
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  console.log("👉 /api/parse hit", req.method);

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
      console.error('❌ Erreur listage bucket:', listError);
      return res.status(500).json({ 
        error: 'Erreur listage bucket', 
        details: listError.message 
      });
    }

    console.log(`📂 ${files?.length || 0} fichiers trouvés dans cvs/`);

    const results: { 
      path: string; 
      extracted?: Candidat; 
      confidence?: number;
      error?: string 
    }[] = [];

    for (const file of files || []) {
      // Vérifier l'extension du fichier
      const extension = file.name.toLowerCase().split('.').pop();
      const isSupported = ['pdf', 'docx', 'doc', 'txt'].includes(extension || '');
      
      if (!isSupported) {
        console.log(`⏭️ Ignoré (format non supporté) : ${file.name}`);
        continue;
      }

      try {
        const fullPath = `cvs/${file.name}`;
        console.log('⬇️ Téléchargement du fichier :', fullPath);

        // Télécharger le fichier
        const { data: fileData, error: downloadError } = await supabase
          .storage
          .from('truthtalent')
          .download(fullPath);

        if (downloadError) throw new Error(downloadError.message);
        if (!fileData) throw new Error('Fichier vide ou non accessible');

        // Convertir en Buffer
        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Déterminer le type MIME
        const fileType = getMimeType(extension!);

        // 2️⃣ Extraire données du CV
        console.log('🧾 Extraction CV :', file.name);
        const parseResult = await parseCV(buffer, file.name, fileType);
        
        if (!parseResult || !parseResult.candidat) {
          throw new Error('Échec de l\'extraction des données');
        }

        const extracted = parseResult.candidat;
        console.log('🧠 Données extraites pour:', file.name);
        console.log('- Score de confiance:', parseResult.confidence_score);
        console.log('- Prénom:', extracted.prenom);
        console.log('-Nom:', extracted.nom,);

        // 3️⃣ Vérifier doublon
        const { data: existing } = await supabase
          .from('candidats')
          .select('id')
          .eq('fichier', file.name)
          .maybeSingle();

        if (!existing) {
          // Préparer les données pour l'insertion
          const candidatData: Candidat = {
            ...extracted,
            fichier: file.name,
            cv_filename: file.name,
            confidence_score: parseResult.confidence_score,
            file_type: fileType,
            extraction_date: new Date().toISOString(),
            date_extraction: new Date().toISOString(),
            // Assurer que les champs obligatoires ont au moins null
            nom: extracted.nom || null,
            prenom: extracted.prenom || null,
            email: extracted.email || null,
            telephone: extracted.telephone || null,
            poste: extracted.poste || null,
            entreprise: extracted.entreprise || null,
            profil: extracted.profil || null,
            competences: extracted.competences || [],
            metiers: extracted.metiers || [],
            experiences: extracted.experiences || [],
            formations: extracted.formations || [],
            langues: extracted.langues || [],
            adresse: extracted.adresse || null,
            linkedin: extracted.linkedin || null,
            niveau: extracted.niveau || null,
          };

          // Insérer dans la base de données
          const { error: dbError } = await supabase
            .from('candidats')
            .insert([candidatData]);

          if (dbError) {
            console.error('❌ Erreur insertion BD:', dbError);
            throw new Error(`Erreur BD: ${dbError.message}`);
          }

          console.log('✅ Insert OK :', file.name);
          results.push({ 
            path: fullPath, 
            extracted: candidatData,
            confidence: parseResult.confidence_score
          });
        } else {
          console.log(`ℹ️ Déjà en base : ${file.name}`);
          results.push({ 
            path: fullPath, 
            error: 'Déjà en base',
            confidence: parseResult.confidence_score
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('❌ Erreur pour', file.name, ':', msg);
        results.push({ 
          path: `cvs/${file.name}`, 
          error: msg 
        });
      }
    }

    return res.status(200).json({ 
      message: 'CV analysés et insérés', 
      total: files?.length || 0,
      processed: results.length,
      results 
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('💥 Erreur globale /api/parse:', err);
    return res.status(500).json({ error: err });
  }
}

// Fonction utilitaire pour obtenir le type MIME
function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'txt': 'text/plain'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}