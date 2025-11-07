// routes/analyze-cvs.ts
import { Router } from "express";
import { CVProcessor } from "../services/cvProcessor";
import { supabase } from "../utils/supabase";

const router = Router();
const cvProcessor = new CVProcessor();

// Lancer l'analyse de tous les CVs non analysés
router.post("/process", async (req, res) => {
  try {
    console.log("🚀 Démarrage analyse des CVs...");

    await cvProcessor.processUnanalyzedCVs();

    res.json({
      success: true,
      message: "Analyse des CVs terminée avec succès"
    });

  } catch (error: any) {
    console.error("❌ Erreur analyse CVs:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Analyser un CV spécifique
router.post("/process/:candidatId", async (req, res) => {
  try {
    const { candidatId } = req.params;

    console.log(`🔍 Analyse CV spécifique: ${candidatId}`);

    // Récupérer le candidat
    const { data: candidat, error } = await supabase
      .from("candidats")
      .select("*")
      .eq("id", candidatId)
      .single();

    if (error || !candidat) {
      return res.status(404).json({
        success: false,
        error: "Candidat non trouvé"
      });
    }

    const cvProcessor = new CVProcessor();
    await cvProcessor.processSingleCV(candidat);

    res.json({
      success: true,
      message: `CV ${candidat.fichier} analysé avec succès`
    });

  } catch (error: any) {
    console.error("❌ Erreur analyse CV spécifique:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;