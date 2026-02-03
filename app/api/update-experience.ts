// pages/api/update-experience.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../utils/supabase";
import { calculateTotalExperience } from "../../utils/experience-calculator";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { batch_size = "100", candidate_id } = req.body;
    const batchSize = parseInt(batch_size as string);

    console.log("🔄 Mise à jour des expériences", { batchSize, candidate_id });

    // Mise à jour pour un candidat spécifique
    if (candidate_id) {
      const { data: candidat, error: fetchError } = await supabase
        .from("candidats")
        .select("id, experiences")
        .eq("id", candidate_id)
        .single();

      if (fetchError) throw fetchError;

      const annees_experience = calculateTotalExperience(
        candidat.experiences || [],
      );

      const { error: updateError } = await supabase
        .from("candidats")
        .update({
          annees_experience,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate_id);

      if (updateError) throw updateError;

      return res.status(200).json({
        success: true,
        message: `Expérience mise à jour pour le candidat ${candidate_id}`,
        annees_experience,
        candidate_id,
      });
    }

    // Mise à jour par lots (pour tous les candidats)
    let page = 0;
    let updated = 0;
    let errors = [];

    while (true) {
      const from = page * batchSize;
      const to = from + batchSize - 1;

      console.log(`📦 Lot ${page + 1}: candidats ${from} à ${to}`);

      // Récupérer un lot de candidats
      const { data: candidats, error: fetchError } = await supabase
        .from("candidats")
        .select("id, experiences")
        .range(from, to);

      if (fetchError) throw fetchError;

      if (!candidats || candidats.length === 0) {
        break; // Plus de candidats
      }

      // Mettre à jour chaque candidat du lot
      for (const candidat of candidats) {
        try {
          const annees_experience = calculateTotalExperience(
            candidat.experiences || [],
          );

          const { error: updateError } = await supabase
            .from("candidats")
            .update({
              annees_experience,
              updated_at: new Date().toISOString(),
            })
            .eq("id", candidat.id);

          if (updateError) {
            errors.push({
              id: candidat.id,
              error: updateError.message,
            });
          } else {
            updated++;
          }
        } catch (err: any) {
          errors.push({
            id: candidat.id,
            error: err.message,
          });
        }
      }

      page++;

      // Petit délai pour ne pas surcharger Supabase
      if (candidats.length === batchSize) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(
      `✅ Mise à jour terminée: ${updated} candidats mis à jour, ${errors.length} erreurs`,
    );

    return res.status(200).json({
      success: true,
      message: `Mise à jour terminée`,
      stats: {
        total_updated: updated,
        total_errors: errors.length,
        batches: page,
      },
      errors: errors.slice(0, 10), // Limiter l'affichage des erreurs
    });
  } catch (error: any) {
    console.error("💥 Erreur mise à jour expérience:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
