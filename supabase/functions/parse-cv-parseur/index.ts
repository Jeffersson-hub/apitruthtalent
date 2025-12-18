import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===============================
// CONFIG
// ===============================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, PARSEUR_SECRET",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PARSEUR_SECRET = Deno.env.get("PARSEUR_SECRET");

// Supabase client (service role)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// ===============================
// SERVER
// ===============================
serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  // ===============================
  // 🔐 WEBHOOK SECURITY
  // ===============================
  const secret = req.headers.get("PARSEUR_SECRET");

  if (!PARSEUR_SECRET) {
    console.error("❌ PARSEUR_SECRET manquant côté Supabase");
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500, headers: corsHeaders }
    );
  }

  if (!secret || secret !== PARSEUR_SECRET) {
    console.warn("🚫 rejeté : secret invalide");
    return new Response(
      JSON.stringify({ error: "Unauthorized webhook" }),
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const webhookData = await req.json();
    console.log("📨  Parseur reçu");

    const candidatData = mapParseurToCandidat(webhookData);

    const { data, error } = await supabase
      .from("candidats")
      .insert(candidatData)
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, candidat: data }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error("❌ Erreur Parseur:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ===============================
// MAPPING
// ===============================
function mapParseurToCandidat(webhookData: any) {
  const parsed = webhookData.parsed || {};

  return {
    nom: parsed.Nom ?? null,
    prenom: parsed.Prénom ?? null,
    email: parsed.Email ?? null,
    telephone: parsed.Téléphone ?? null,
    source_analyse: "parseur",
    parseur_doc_id: webhookData.id ?? null,
    date_analyse: new Date().toISOString(),
  };
}
