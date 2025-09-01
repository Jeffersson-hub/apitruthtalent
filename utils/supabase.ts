// utils/supabase.ts
import { createClient } from "@supabase/supabase-js";


const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ Variables SUPABASE_URL et SUPABASE_ANON_KEY manquantes !");
}

//export const supabase = createClient(supabaseUrl, supabaseKey);

export const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function uploadAndParse(file: File) {
  // 1) Upload
  const path = `cvs/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("truthtalent").upload(path, file, {
    upsert: false,
    contentType: file.type
  });
  if (upErr) throw upErr;

  // 2) Appel Edge Function
  const res = await fetch(`${process.env.SUPABASE_URL}/functions/v1/extract-cv-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_ANON_KEY! },
    body: JSON.stringify({ file_path: path })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Edge error");
  return json.candidat;
}