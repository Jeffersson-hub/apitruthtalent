// Deno Edge Function
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.44.0";
// 🔹 Configuration CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://truthtalent.online",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
// 🔹 Fonction principale
serve(async (req)=>{
  // --- Gestion des préflights CORS ---
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    // --- Récupérer le body ---
    const { file_path } = await req.json();
    if (!file_path) {
      return new Response(JSON.stringify({
        error: "file_path is required"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // --- Config Supabase ---
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const PARSER_URL = Deno.env.get("EXTERNAL_PARSER_URL");
    console.log("SUPABASE_URL:", SUPABASE_URL ? "OK" : "MISSING");
    console.log("SERVICE_KEY:", SERVICE_KEY ? "OK" : "MISSING");
    console.log("PARSER_URL:", PARSER_URL ? "OK" : "MISSING");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Supabase configuration missing: SUPABASE_URL or SERVICE_KEY");
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    // --- Générer URL signée ---
    const { data: signed, error: signErr } = await supabase.storage.from("truthtalent").createSignedUrl(file_path, 900);
    if (signErr || !signed) {
      console.error("Sign URL error:", signErr);
      throw new Error("Cannot sign URL: " + (signErr?.message ?? "unknown"));
    }
    console.log("Signed URL generated:", signed.signedUrl);
    // --- Appel microservice externe ---
    const fileName = file_path.split("/").pop();
    console.log("Calling parser with URL:", signed.signedUrl);
    const parserRes = await fetch(EXTERNAL_PARSER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file_url: signed.signedUrl,
        file_name: fileName
      })
    });
    if (!parserRes.ok) {
      const t = await parserRes.text();
      console.error("Parser response:", parserRes.status, t);
      throw new Error(`Parser error: ${parserRes.status} ${t}`);
    }
    const parsed = await parserRes.json();
    console.log("Parser response:", parsed);
    if (!parsed || parsed.error) {
      throw new Error(parsed.error || "Parser failed");
    }
    // --- Upsert en base ---
    const candidat = {
      fichier: parsed.fichier ?? fileName,
      nom: parsed.nom ?? null,
      prenom: parsed.prenom ?? null,
      email: parsed.email ?? null,
      telephone: parsed.telephone ?? null,
      adresse: parsed.adresse ?? null,
      poste: parsed.poste ?? null,
      entreprise: parsed.entreprise ?? null,
      profil: parsed.profil ?? null,
      linkedin: parsed.linkedin ?? null,
      competences: parsed.competences ?? [],
      metiers: parsed.metiers ?? [],
      experiences: parsed.experiences ?? [],
      formations: parsed.formations ?? [],
      langues: parsed.langues ?? [],
      links: parsed.links ?? [],
      raw_text: parsed.raw_text ?? null
    };
    const { error: dbErr } = await supabase.from("candidats").upsert(candidat, {
      onConflict: "fichier"
    });
    if (dbErr) {
      console.error("DB upsert error:", dbErr);
      throw new Error("DB upsert error: " + dbErr.message);
    }
    // --- Réponse finale ---
    return new Response(JSON.stringify({
      success: true,
      candidat
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    console.error("Error in Edge Function:", e);
    return new Response(JSON.stringify({
      error: e.message ?? String(e)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
