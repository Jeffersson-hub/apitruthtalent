import { supabase } from "../utils/supabase";
import { fetchToBuffer } from "../utils/fetchToBuffer";
import { extractCVData } from "./documentParser";

/**
 * Traite le job pending le plus ancien (FIFO).
 * - met à jour le statut du job (processing -> done / error)
 * - pour chaque fichier: récupère le buffer, parse, insert/update candidat
 */
export async function processJobs(): Promise<void> {
  console.log('▶️ processJobs: recherche d\'un job pending');

  // Récupérer un job pending
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (jobsError) {
    console.error('❌ Erreur lecture jobs:', jobsError);
    return;
  }

  if (!jobs || jobs.length === 0) {
    console.log('✅ Aucun job pending trouvé');
    return;
  }

  const job = jobs[0];
  console.log(`🔄 Traitement job ${job.id}`);

  // Marquer processing
  await supabase.from('jobs').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', job.id);

  let processed = job.processed || 0;
  let errorsCount = 0;

  for (const url of job.files || []) {
    try {
      console.log(`⬇️ Téléchargement: ${url}`);
      const { buffer, filename } = await fetchToBuffer(url);

      // Extraire données via documentParser existant
      const parsed = await extractCVData(buffer, filename, supabase);

      // Construire payload update en respectant ta table candidats
      const payload: any = {
        nom: parsed.nom || null,
        prenom: parsed.prenom || null,
        email: parsed.email || null,
        telephone: parsed.telephone || null,
        adresse: parsed.adresse || null,
        competences: parsed.competences || null,
        experiences: parsed.experiences || null,
        linkedin: parsed.linkedin || null,
        formations: parsed.formations || null,
        langues: parsed.langues || null,
        raw_text: parsed.raw_text || null,
        metiers: Array.isArray(parsed.metiers) ? parsed.metiers.join(', ') : parsed.metiers || null,
        entreprise: parsed.entreprise || null,
        fichier: parsed.fichier || filename,
        postes: Array.isArray(parsed.postes) ? parsed.postes.join(', ') : parsed.postes || null,
        profil: parsed.profil || null,
        niveau: parsed.niveau || null,
        annees_experience: parsed.annees_experience || 0,
        cv_filename: parsed.cv_filename || filename,
        cv_url: url,
        updated_at: new Date().toISOString()
      };

      // Insérer ou mettre à jour la ligne candidat liée si candidat_id fourni
      if (job.candidat_id) {
        // Mettre à jour la ligne existante
        const { error: updateError } = await supabase
          .from('candidats')
          .update({
            ...payload,
            status: 'analyse_terminee',
            date_analyse: new Date().toISOString()
          })
          .eq('id', job.candidat_id);

        if (updateError) {
          throw updateError;
        }
      } else {
        // Insérer nouvelle ligne
        const { error: insertError } = await supabase.from('candidats').insert({
          ...payload,
          status: 'analyse_terminee',
          date_analyse: new Date().toISOString()
        });

        if (insertError) {
          throw insertError;
        }
      }

      processed++;
      // Mise à jour progression job
      await supabase.from('jobs').update({ processed }).eq('id', job.id);

      console.log(`✅ Fichier traité: ${filename}`);

    } catch (err: any) {
      console.error('❌ Erreur traitement fichier du job:', err);
      errorsCount++;
      // Enregistrer l'erreur partielle
      await supabase.from('jobs').update({
        last_error: err.message ? String(err.message).substring(0, 1000) : String(err),
        error_count: (job.error_count || 0) + 1
      }).eq('id', job.id);
    }
  }

  // Finaliser job
  const finalStatus = errorsCount === 0 ? 'done' : 'error';
  await supabase.from('jobs').update({
    status: finalStatus,
    finished_at: new Date().toISOString(),
    processed
  }).eq('id', job.id);

  console.log(`🏁 Job ${job.id} terminé (status=${finalStatus}, processed=${processed}, errors=${errorsCount})`);
}