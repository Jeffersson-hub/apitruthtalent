// services/jobWorkers.ts
import { supabase } from "../utils/supabase";
import { fetchToBuffer } from "../utils/fetchToBuffer";
import { extractCVData } from "./documentParser";

export async function processJobs() {
  // Cherche un job "pending"
  const { data: jobs } = await supabase.from("jobs").select("*").eq("status", "pending").limit(1);

  if (!jobs || jobs.length === 0) return;

  const job = jobs[0];
  let processed = 0;

  for (const url of job.files) {
    try {
      const { buffer, filename } = await fetchToBuffer(url);
      
      // CORRECTION : bon ordre des paramètres
      const parsed = await extractCVData(buffer, filename, supabase);

      await supabase.from("candidats").insert(parsed as any);
      processed++;

      // Mise à jour progression
      await supabase.from("jobs").update({ processed }).eq("id", job.id);
    } catch (e) {
      console.error("Erreur traitement CV:", e);
    }
  }

  // Job terminé
  await supabase.from("jobs").update({ status: "done" }).eq("id", job.id);
}