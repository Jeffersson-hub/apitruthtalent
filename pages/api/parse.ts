// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { extractCVData } from "../../utils/extractCVData";
import { Candidat } from "../../types/candidats";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ✅ Autoriser uniquement POST
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // ✅ CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "https://truthtalent.online");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ✅ Init Supabase
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase env vars");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log("👉 /api/parse hit", req.method);

    // Lister fichiers
    const { data: files, error: listError } = await supabase
      .storage
      .from("truthtalent")
      .list("cvs", { limit: 100 });

    if (listError) {
      console.error("❌ Erreur listage bucket:", listError);
      return res.status(500).json({ error: "Erreur listage bucket", details: listError });
    }

    const results: { path: string; extracted?: Candidat; error?: string }[] = [];

    for (const file of files || []) {
      if (!/\.(pdf|docx?|DOCX?)$/.test(file.name)) {
        console.log(`⏭️ Ignoré : ${file.name}`);
        continue;
      }

      try {
        const fullPath = `cvs/${file.name}`;
        console.log("⬇️ Téléchargement :", fullPath);

        const { data, error: downloadError } = await supabase
          .storage
          .from("truthtalent")
          .download(fullPath);

        if (downloadError) throw new Error(downloadError.message);
        if (!data) throw new Error("Fichier vide");

        const buffer = Buffer.from(await data.arrayBuffer());

        console.log("🧾 Extraction CV :", file.name);
        const extracted = await extractCVData(buffer, file.name);

        // Vérifier doublon
        const { data: existing } = await supabase
          .from("candidats")
          .select("id")
          .eq("fichier", file.name)
          .maybeSingle();

        if (!existing) {
          const { error: dbError } = await supabase
            .from("candidats")
            .insert([{ ...extracted, fichier: file.name }]);

          if (dbError) throw new Error(dbError.message);

          console.log("✅ Insert OK :", file.name);
          results.push({ path: fullPath, extracted });
        } else {
          console.log(`ℹ️ Déjà en base : ${file.name}`);
          results.push({ path: fullPath, error: "Déjà en base" });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Erreur inconnue";
        console.error("❌ Erreur pour", file.name, ":", errMsg);
        results.push({ path: `cvs/${file.name}`, error: errMsg });
      }
    }

    return res.status(200).json({ message: "CV analysés et insérés", results });
  } catch (e) {
    const err = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("💥 Erreur globale /api/parse:", err);
    return res.status(500).json({ error: err });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
