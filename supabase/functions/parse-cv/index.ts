// supabase/functions/parse-cv/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
  try {
    const { type, record } = await req.json();

    console.log("📥 Trigger reçu :", type, record);

    if (type !== "INSERT") {
      return new Response(JSON.stringify({ message: "Pas un INSERT, ignoré" }), { status: 200 });
    }

    // CV ajouté dans le bucket
    const filePath = record?.name;
    console.log("🆕 Nouveau fichier uploadé :", filePath);

    // Appel API Vercel /api/parse
    const vercelUrl = "https://apitruthtalent.vercel.app/api/parse";

    const response = await fetch(vercelUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: filePath }),
    });

    const result = await response.json();
    console.log("✅ Analyse API retour :", result);

    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  } catch (err) {
    console.error("💥 Erreur fonction parse-cv :", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
