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
    // 1️⃣ Lister les fichiers dans le dossier "cvs/"
    const { data: files, error: listError } = await supabase
      .storage
      .from('truthtalent')
      .list('cvs', { limit: 100 });

    if (listError) {
      console.error('❌ Erreur listage bucket:', listError);
      return res.status(500).json({ error: 'Erreur listage bucket', details: listError });
    }

    console.log(`📂 ${files?.length || 0} fichiers trouvés dans cvs/`);

    const results: { path: string; extracted?: Candidat; error?: string }[] = [];

    // 2️⃣ Traiter uniquement les fichiers PDF / DOCX
    for (const file of files || []) {
      if (!(file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.doc'))) {
        console.log(`⏭️ Ignoré (non CV) : ${file.name}`);
        continue;
      }

      try {
        const fullPath = `cvs/${file.name}`;
        console.log('⬇️ Téléchargement du fichier :', fullPath);

        const { data, error: downloadError } = await supabase
          .storage
          .from('truthtalent')
          .download(fullPath);

        if (downloadError) throw new Error(downloadError.message);
        if (!data) throw new Error('Fichier vide ou non accessible');

        const buffer = Buffer.from(await data.arrayBuffer());

        // 3️⃣ Extraire les données du CV
        console.log('🧾 Extraction CV :', file.name);
        const extracted = await extractCVData(buffer, file.name);
        console.log('🧠 Données extraites :', extracted);

        // 4️⃣ Insérer en base uniquement si pas déjà présent
        const { data: existing, error: existingError } = await supabase
          .from('candidats')
          .select('id')
          .eq('fichier', file.name)
          .maybeSingle();

        if (existingError) {
          console.error('⚠️ Erreur vérif doublon :', existingError.message);
        }

        if (!existing) {
          const { data: dbData, error: dbError } = await supabase
            .from('candidats')
            .insert([{ ...extracted, fichier: file.name }])
            .select();

          if (dbError) throw new Error(dbError.message);

          console.log('✅ Insert OK :', dbData);
          results.push({ path: fullPath, extracted });
        } else {
          console.log(`ℹ️ Déjà en base : ${file.name}`);
          results.push({ path: fullPath, error: 'Déjà en base' });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Erreur inconnue';
        console.error('❌ Erreur pour', file.name, ':', errMsg);
        results.push({ path: `cvs/${file.name}`, error: errMsg });
      }
    }

    return res.status(200).json({ message: 'CV analysés et insérés', results });
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Erreur inconnue';
    console.error('💥 Erreur globale /api/parse:', err);
    return res.status(500).json({ error: err });
  }
}
