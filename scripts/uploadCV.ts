// script/uploadCV.ts
// 
import { readFile } from "fs/promises";
import path from "path";
import { supabase } from "../utils/supabase";

const __dirname = path.resolve();

async function main() {
  const filePath = path.join(__dirname, "../cvs/mon-cv.pdf");
  const fileBuffer = await readFile(filePath);

  const { data, error } = await supabase.storage
    .from("truthtalent")
    .upload(`cvs/${Date.now()}-cv.pdf`, fileBuffer, {
      contentType: "application/pdf"
    });

  if (error) {
    console.error("❌ Erreur upload:", error.message);
  } else {
    console.log("✅ Fichier uploadé:", data);
  }
}

main().catch(console.error);
