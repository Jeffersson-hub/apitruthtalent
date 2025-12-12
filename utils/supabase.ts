// utils/supabase.ts - VERSION NETTOYÉE
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ Variables SUPABASE_URL et SUPABASE_ANON_KEY manquantes !");
}

// Client Supabase unique et propre
export const supabase = createClient(supabaseUrl, supabaseKey);

// Optionnel : Ajouter des logs pour le débogage
console.log("✅ Client Supabase initialisé avec URL:", supabaseUrl.substring(0, 50) + "...");