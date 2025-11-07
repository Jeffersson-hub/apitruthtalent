// supabase/functions/parse-cv-affinda/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AffindaCredential, AffindaAPI } from "npm:@affinda/affinda";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

serve(async (req) => {
  // ---- Préflight ----
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // -------------------------------------
    // 0 - RÉCUPÉRATION ÉVÉNEMENT STORAGE
    // -------------------------------------
    const { type, record } = await req.json();
    console.log("📥 Trigger reçu :", { type, record });

    if (type !== "INSERT" || !record?.name) {
      return new Response(
        JSON.stringify({ message: "Ignoré" }),
        { status: 200, headers: corsHeaders }
      );
    }

    const filePath = record.name;
    console.log("🆕 Nouveau fichier uploadé :", filePath);

    // -------------------------------------
    // 1 - CONFIG SUPABASE
    // -------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // -------------------------------------
    // 2 - TÉLÉCHARGER LE PDF DEPUIS STORAGE
    // -------------------------------------
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("truthtalent")
      .download(filePath);

    if (downloadError) {
      console.error("❌ Erreur téléchargement :", downloadError);
      return new Response(
        JSON.stringify({ error: downloadError.message }),
        { status: 500, headers: corsHeaders }
      );
    }

    console.log("📄 Fichier téléchargé OK :", filePath);

    const fileBlob = new Blob([fileData], { type: "application/pdf" });

    // -------------------------------------
    // 3 - APPEL AFFINDA
    // -------------------------------------
    const apiKey = Deno.env.get("AFFINDA_API_KEY");
    if (!apiKey) throw new Error("AFFINDA_API_KEY manquant");
    
    const credential = new AffindaCredential(apiKey);
    const client = new AffindaAPI(credential);

    console.log("🚀 Envoi vers Affinda…");
    const affindaResult = await client.createResume({ file: fileBlob });
    console.log("✅ Réponse Affinda reçue !");

    // -------------------------------------
    // 4 - RETOUR POUR TEST
    // -------------------------------------
    return new Response(
      JSON.stringify({
        ok: true,
        file: filePath,
        extracted: affindaResult
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error("💥 Erreur parse-cv-affinda :", err);

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
