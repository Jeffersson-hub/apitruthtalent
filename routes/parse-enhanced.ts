// routes/parse-enhanced.ts
import { Router } from "express";
import { supabase } from "../utils/supabase";
import { fetchToBuffer } from "../utils/fetchToBuffer";
import { extractCVData } from "../services/documentParser";

const router = Router();

// Endpoint dédié pour le parsing amélioré
router.post("/enhanced", async (req, res) => {
  try {
    const { files } = req.body;
    
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ 
        error: "Tableau 'files' contenant les URLs des CVs requis" 
      });
    }

    console.log(`🔄 Début parsing amélioré de ${files.length} CVs`);

    const results = [];
    
    for (const [index, url] of files.entries()) {
      try {
        console.log(`📄 Traitement CV ${index + 1}/${files.length}: ${url}`);
        
        const { buffer, filename } = await fetchToBuffer(url);
        
        // Utiliser l'extraction améliorée
        const parsedData = await extractCVData(buffer, filename, supabase);
        
        // Insérer dans Supabase
        const { data, error } = await supabase
          .from("candidats")
          .insert(parsedData)
          .select();

        if (error) {
          console.error(`❌ Erreur insertion ${filename}:`, error);
          results.push({ 
            url, 
            success: false, 
            error: error.message,
            filename 
          });
        } else {
          console.log(`✅ CV ${filename} parsé et inséré avec succès`);
          results.push({ 
            url, 
            success: true, 
            data: parsedData,
            filename,
            id: data?.[0]?.id 
          });
        }
        
      } catch (error: any) {
        console.error(`💥 Erreur traitement ${url}:`, error);
        results.push({ 
          url, 
          success: false, 
          error: error.message 
        });
      }
    }

    // Statistiques
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(`🎉 Parsing terminé: ${successCount} succès, ${errorCount} erreurs`);

    res.status(200).json({
      success: true,
      summary: {
        total: files.length,
        success: successCount,
        errors: errorCount
      },
      results
    });

  } catch (error: any) {
    console.error('💥 Erreur globale parsing:', error);
    res.status(500).json({ 
      error: "Erreur interne du serveur", 
      details: error.message 
    });
  }
});

// Endpoint pour tester le parsing sur un CV spécifique
router.post("/test", async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: "URL du CV requis" });
    }

    console.log(`🧪 Test parsing: ${url}`);
    
    const { buffer, filename } = await fetchToBuffer(url);
    const parsedData = await extractCVData(buffer, filename, supabase);

    res.status(200).json({
      success: true,
      data: parsedData,
      debug: {
        filename,
        text_length: buffer.toString().length,
        metiers_found: parsedData.metiers.length,
        competences_found: parsedData.competences.length
      }
    });

  } catch (error: any) {
    console.error('Erreur test parsing:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// AJOUTER CETTE LIGNE À LA FIN DU FICHIER
export default router;