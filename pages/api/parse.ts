// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { extractCVData } from "../../services/documentParser";
import type { Candidat } from "../../types/candidats";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS (ajuste si besoin)
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "https://truthtalent.online");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");


  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server misconfigured" });
    }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { file_url, file_name, file_path } = (req.body || {}) as {
      file_url?: string;
      file_name?: string;
      file_path?: string; // e.g. "cvs/xxx.pdf"
    };

    // ---------- Mode 1 : un seul fichier via URL signée ----------
    if (file_url && file_name) {
      const buf = Buffer.from(await (await fetch(file_url)).arrayBuffer());
      const parsed: Candidat = await extractCVData(buf, file_name, supabase);

      const { error: dbErr } = await supabase
        .from("candidats")
        .upsert(parsed, { onConflict: "fichier" });
      if (dbErr) throw new Error("DB upsert error: " + dbErr.message);

      console.log("📝 Parsed candidat:", parsed);

    }

    // ---------- Mode 2 : un seul fichier via chemin du bucket ----------
    if (file_path) {
      const { data, error: dlErr } = await supabase.storage
        .from("truthtalent")
        .download(file_path);
      if (dlErr || !data) throw new Error("Download error: " + (dlErr?.message || "unknown"));

      const buf = Buffer.from(await data.arrayBuffer());
      const parsed: Candidat = await extractCVData(buf, file_path.split("/").pop() || file_path, supabase);

      const { error: dbErr } = await supabase
        .from("candidats")
        .upsert(parsed, { onConflict: "fichier" });
      if (dbErr) throw new Error("DB upsert error: " + dbErr.message);

      return res.status(200).json({ message: "OK", candidat: parsed });
    }

    // ---------- Mode 3 : batch sur tout le dossier cvs/ ----------
    const { data: files, error: listErr } = await supabase.storage
      .from("truthtalent")
      .list("cvs", { limit: 200 });
    if (listErr) throw new Error("List error: " + listErr.message);

    const results: Array<{ path: string; ok?: boolean; error?: string }> = [];

    for (const f of files || []) {
      const ext = f.name.toLowerCase();
      if (!ext.match(/\.(pdf|docx)$/)) {
        results.push({ path: `cvs/${f.name}`, error: "Format non supporté (utiliser PDF ou DOCX)" });
        continue;
      }

      try {
        const { data, error: dlErr } = await supabase.storage
          .from("truthtalent")
          .download(`cvs/${f.name}`);
        if (dlErr || !data) throw new Error(dlErr?.message || "download failed");

        const buf = Buffer.from(await data.arrayBuffer());
        const parsed: Candidat = await extractCVData(buf, f.name, supabase);

        const { error: dbErr } = await supabase
          .from("candidats")
          .upsert(parsed, { onConflict: "fichier" });
        if (dbErr) throw new Error(dbErr.message);

        results.push({ path: `cvs/${f.name}`, ok: true });
      } catch (e: any) {
        results.push({ path: `cvs/${f.name}`, error: e?.message || String(e) });
      }
    }

    return res.status(200).json({ message: "Batch terminé", results });
  } catch (e: any) {
    console.error("💥 /api/parse error:", e?.message || e);
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
