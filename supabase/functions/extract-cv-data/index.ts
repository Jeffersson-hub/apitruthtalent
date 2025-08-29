// Deno Edge Function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.44.0";

const cors = {
  "Access-Control-Allow-Origin": "https://truthtalent.online", // ou "*"
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const { file_path } = await req.json(); // ex: "cvs/moncv.pdf"
    if (!file_path) {
      return new Response(JSON.stringify({ error: "file_path required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // nécessaire pour signer + écrire DB
    const PARSER_URL   = Deno.env.get("EXTERNAL_PARSER_URL")!;       // ex: https://mon-parser.onrender.com/parse

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) URL signée pour le téléchargement
    const { data: signed, error: signErr } = await supabase.storage
      .from("truthtalent")
      .createSignedUrl(file_path, 900); // 15 min

    if (signErr || !signed) {
      throw new Error("Cannot sign URL: " + (signErr?.message ?? "unknown"));
    }

    // 2) Appel au microservice d'extraction
    const fileName = file_path.split("/").pop()!;
    const parserRes = await fetch(PARSER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url: signed.signedUrl, file_name: fileName })
    });

    if (!parserRes.ok) {
      const t = await parserRes.text();
      throw new Error(`Parser error: ${parserRes.status} ${t}`);
    }

    const { ok, data, error } = await parserRes.json();
    if (!ok) throw new Error(error || "Parser returned not ok");

    // 3) Upsert en base
    const upsert = {
      fichier: data.fichier ?? fileName,
      nom: data.nom ?? null,
      prenom: data.prenom ?? null,
      email: data.email ?? null,
      telephone: data.telephone ?? null,
      adresse: data.adresse ?? null,
      poste: data.poste ?? null,
      entreprise: data.entreprise ?? null,
      profil: data.profil ?? null,
      linkedin: data.linkedin ?? null,
      competences: data.competences ?? [],
      metiers: data.metiers ?? [],
      experiences: data.experiences ?? [],
      formations: data.formations ?? [],
      langues: data.langues ?? [],
      links: data.links ?? [],
      raw_text: data.raw_text ?? null
    };

    const { error: dbErr } = await supabase
      .from("candidats")
      .upsert(upsert, { onConflict: "fichier" });

    if (dbErr) throw new Error("DB upsert error: " + dbErr.message);

    return new Response(JSON.stringify({ message: "OK", candidat: upsert }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});
