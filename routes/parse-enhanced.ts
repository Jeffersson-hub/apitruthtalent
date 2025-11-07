// routes/parse-enhanced.ts
import { Router } from "express";
import { supabase } from "../utils/supabase";
import { fetchToBuffer } from "../utils/fetchToBuffer";
import { CVParserEnhanced } from "../services/cvParserEnhanced";

const router = Router();
const cvParser = new CVParserEnhanced();

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
        
        // Utiliser le nouveau parser amélioré
        const parsedData = await cvParser.parseCV(buffer, filename, supabase);
        
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

export default router;