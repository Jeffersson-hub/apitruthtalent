// services/cvLister.ts
import { supabase } from "../utils/supabase";

export class CVLister {
  /**
   * Lister tous les CVs avec leur statut
   */
  async listAllCVs(options: { 
    limit?: number; 
    offset?: number;
    status?: string;
  } = {}): Promise<any[]> {
    const { limit = 50, offset = 0, status } = options;

    let query = supabase
      .from("candidats")
      .select(`
        id,
        fichier,
        cv_url,
        nom,
        prenom,
        email,
        status,
        date_upload,
        date_analyse,
        metiers,
        niveau,
        competences,
        erreur_analyse
      `)
      .order("date_upload", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /**
   * Obtenir les statistiques des CVs
   */
  async getCVStats(): Promise<any> {
    const { data, error } = await supabase
      .from("candidats")
      .select("status");

    if (error) {
      throw error;
    }

    const stats = {
      total: data.length,
      non_analyse: data.filter((c: any) => !c.status || c.status === 'en_attente').length,
      en_analyse: data.filter((c: any) => c.status === 'en_analyse').length,
      analyse_terminee: data.filter((c: any) => c.status === 'analyse_terminee').length,
      erreur: data.filter((c: any) => c.status === 'erreur_analyse').length
    };

    return stats;
  }
}