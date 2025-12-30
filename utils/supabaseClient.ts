import { createClient } from "@supabase/supabase-js";

// export const supabase = createClient(supabaseUrl, supabaseKey);

export async function listCVs() {
  const { data, error } = await supabase.storage.from("truthtalent").list();
  if (error) throw error;
  return data;
}

const supabase = createClient(process.env.SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

