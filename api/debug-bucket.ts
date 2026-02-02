import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    // Lister les fichiers
    const { data: files, error: listError } = await supabase
      .storage
      .from("truthtalent")
      .list("cvs");

    if (listError) {
      return res.status(500).json({ error: listError.message });
    }

    if (!files || files.length === 0) {
      return res.status(200).json({ message: "Aucun fichier trouvé dans cvs/" });
    }

    // Essayer de télécharger le premier fichier
    const fileName = files[0].name;
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("truthtalent")
      .download(`cvs/${fileName}`);

    if (downloadError) {
      return res.status(500).json({ error: downloadError.message });
    }

    const size = (await fileData.arrayBuffer()).byteLength;

    return res.status(200).json({
      message: "Bucket accessible ✅",
      files,
      firstFile: fileName,
      firstFileSize: size
    });

  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
