import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// export const supabase = createClient(supabaseUrl, supabaseKey);

export async function listCVs() {
  const { data, error } = await supabase.storage.from("truthtalent").list();
  if (error) throw error;
  return data;
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function uploadAndParse(file: File) {
  // 1) Upload
  const path = `cvs/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("truthtalent").upload(path, file, {
    upsert: false,
    contentType: file.type
  });
  if (upErr) throw upErr;

  // 2) Appel Edge Function
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-cv-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    body: JSON.stringify({ file_path: path })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Edge error");
  return json.candidat;
}