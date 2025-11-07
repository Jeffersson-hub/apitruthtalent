// routes/upload-cv.ts
import { Router } from "express";
import multer from "multer";
import { supabase } from "../utils/supabase";
import { ParseurService } from "../services/parseurService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const parseurService = new ParseurService();

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { email, nom, prenom } = req.body;

    if (!file) {
      return res.status(400).json({ error: "Fichier manquant" });
    }

    console.log(`📥 Nouveau CV reçu: ${file.originalname}`);

    // 1. Upload vers Supabase Storage
    const fileUrl = await uploadToSupabaseStorage(file, email);
    
    // 2. Envoyer à Parseur pour analyse
    const parseurResult = await parseurService.analyzeWithParseur(fileUrl, file.originalname);
    
    // 3. Préparer les données pour Supabase
    const candidatData = {
      nom,
      prenom,
      email,
      cv_url: fileUrl,
      cv_filename: file.originalname,
      parseur_doc_id: parseurResult.id,
      status: 'en_analyse',
      date_upload: new Date().toISOString()
    };

    // 4. Insertion initiale dans Supabase
    const { data: candidat, error } = await supabase
      .from("candidats")
      .insert(candidatData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log(`✅ CV uploadé et envoyé à Parseur: ${candidat.id}`);

    res.json({
      success: true,
      candidat_id: candidat.id,
      file_url: fileUrl,
      message: "CV reçu et en cours d'analyse"
    });

  } catch (error: any) {
    console.error("❌ Erreur upload CV:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

async function uploadToSupabaseStorage(file: Express.Multer.File, email: string): Promise<string> {
  const filename = `${Date.now()}-${email}-${file.originalname}`;
  
  const { data, error } = await supabase.storage
    .from("truthtalent")
    .upload(`cvs/${filename}`, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    throw new Error(`Erreur upload Supabase: ${error.message}`);
  }

  // Récupérer l'URL publique
  const { data: urlData } = await supabase.storage
    .from("truthtalent")
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

export default router;