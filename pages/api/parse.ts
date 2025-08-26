// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/supabase';
import { extractCVData } from '../../utils/extractCVData';
import { Candidat } from '../../types/candidats';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("👉 /api/parse hit", req.method);

  try {
    // 1️⃣ Lister les fichiers du bucket
    const { data: files, error: listError } = await supabase
      .storage
      .from('truthtalent')
      .list('cvs', { limit: 100 });

    if (listError) {
      console.error('❌ Erreur listage bucket:', listError);
      return res.status(500).json({ error: 'Erreur listage bucket', details: listError });
    }

    console.log(`📂 ${files.length} fichiers trouvés dans le bucket.`);

    const results: { path: string; extracted?: Candidat; error?: string }[] = [];

    // 2️⃣ Traiter chaque fichier
    for (const file of files) {
      try {
        console.log('⬇️ Téléchargement du fichier :', file.name);
        const { data, error: downloadError } = await supabase
          .storage
          .from('truthtalent')
          .download(`cvs/${file.name}`);

        if (downloadError) throw new Error(downloadError.message);
        
        if (!data) throw new Error('Fichier vide ou non accessible');

        const buffer = Buffer.from(await data.arrayBuffer());

        // 3️⃣ Extraire les données
        console.log('🧾 Extraction CV :', file.name);
        const extracted = await extractCVData(buffer, file.name);
        console.log('🧠 Données extraites :', extracted);

        // 4️⃣ Insérer en base
        const { data: dbData, error: dbError } = await supabase
          .from('candidats')
          .insert([extracted])
          .select();

        if (dbError) {
          console.error('❌ Erreur DB', dbError.message);
        } else {
          console.log('✅ Insert OK :', dbData);
        }
        

        results.push({ path: file.name, extracted });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error('❌ Erreur pour', file.name, ':', errMsg);
        results.push({ path: file.name, error: errMsg });
      }
    }

    return res.status(200).json({ message: 'CV analysés et insérés', results });
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('💥 Erreur globale /api/parse:', err);
    return res.status(500).json({ error: err });
  }
}
