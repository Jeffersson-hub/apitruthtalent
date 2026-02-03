// pages/api/test-insert.ts
// 
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

// Cast explicite pour éviter l'erreur "string | undefined"
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const { data, error } = await supabase
      .from("candidats")
      .insert([
        {
          nom: "Test",
          prenom: "API",
          email: "test@api.com",
          telephone: "0600000000"
        }
      ])
      .select();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: "Insert OK ✅", data });
  } catch (e) {
    // caster e en Error ou any
    const err = e as Error;
    return res.status(500).json({ error: err.message || "Erreur inconnue" });
  }
}
