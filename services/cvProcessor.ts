// services/cvProcessor.ts
import { supabase } from "../utils/supabase";
import { AffindaService } from "./affindaService";

export class CVProcessor {
  private affindaService: AffindaService;

  constructor() {
    this.affindaService = new AffindaService();
  }

  /**
   * Traiter tous les CVs non analysés
   */
  async processUnanalyzedCVs(): Promise<void> {
    try {
      console.log("🔄 Recherche de CVs non analysés...");

      // Récupérer les CVs non analysés
      const { data: cvs, error } = await supabase
        .from("candidats")
        .select("id, fichier, cv_url, email, nom, prenom")
        .is("date_analyse", null)
        .limit(10);

      if (error) {
        throw error;
      }

      console.log(`📄 ${cvs?.length || 0} CVs à analyser`);

      if (!cvs || cvs.length === 0) {
        console.log("✅ Aucun CV à analyser");
        return;
      }

      for (const cv of cvs) {
        try {
          await this.processSingleCV(cv);
        } catch (error: any) {
          console.error(`❌ Erreur traitement CV ${cv.id}:`, error);
          await this.markAsError(cv.id, error.message);
        }
      }

      console.log("✅ Traitement des CVs terminé");

    } catch (error: any) {
      console.error("💥 Erreur globale processUnanalyzedCVs:", error);
      throw error;
    }
  }

  /**
   * Traiter un CV individuel - RENDUE PUBLIQUE
   */
  async processSingleCV(cv: any): Promise<void> {
    console.log(`🔍 Analyse CV: ${cv.fichier}`);

    // Marquer comme "en cours d'analyse"
    await this.markAsProcessing(cv.id);

    // Analyser avec Affinda
    const candidatData = await this.affindaService.analyzeCV(cv.cv_url, cv.fichier);

    // Mettre à jour dans Supabase
    await this.updateCandidat(cv.id, candidatData);

    console.log(`✅ CV analysé: ${cv.fichier}`);
  }

  private async markAsProcessing(candidatId: string): Promise<void> {
    const { error } = await supabase
      .from("candidats")
      .update({ 
        status: "en_analyse",
        date_debut_analyse: new Date().toISOString()
      })
      .eq("id", candidatId);

    if (error) throw error;
  }

  private async markAsError(candidatId: string, errorMessage: string): Promise<void> {
    const { error } = await supabase
      .from("candidats")
      .update({ 
        status: "erreur_analyse",
        erreur_analyse: errorMessage,
        date_analyse: new Date().toISOString()
      })
      .eq("id", candidatId);

    if (error) throw error;
  }

  private async updateCandidat(candidatId: string, candidatData: any): Promise<void> {
    const { error } = await supabase
      .from("candidats")
      .update({
        ...candidatData,
        status: "analyse_terminee",
        date_analyse: new Date().toISOString()
      })
      .eq("id", candidatId);

    if (error) throw error;
  }
}