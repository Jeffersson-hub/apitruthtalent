// services/storage.ts - VERSION CORRIGÉE
import express, { Request, Response } from "express";
import pdfParse from "pdf-parse";
import Candidat from "../types/candidats";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ⬅️ Utilisez SERVICE_ROLE_KEY pour les opérations admin
);

/**
 * Récupérer un fichier depuis Supabase Storage
 */
export async function getFileFromStorage(filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from('truthtalent')
    .download(filePath);

  if (error) {
    throw new Error(`Erreur téléchargement fichier: ${error.message}`);
  }

  if (!data) {
    throw new Error('Fichier non trouvé');
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// CORRECTION : Ajouter _ devant les paramètres non utilisés
export async function uploadToStorage(_bucket: string, _path: string, _buffer: Buffer, _mimeType?: string): Promise<void> {
  // Implémentation vide pour l'instant
  console.log("uploadToStorage appelée mais non implémentée");
}

const router = express.Router();

router.post("/parse", async (_req: Request, res: Response) => {
  console.log("🚀 Début extraction de tous les fichiers du bucket");

  // 1️⃣ Lister les fichiers du bucket
  const { data: files, error: listError } = await supabase.storage
    .from("truthtalent")
    .list("cvs", { limit: 100 });

  if (listError) {
    console.error("❌ Erreur listage:", listError);
    return res.status(500).json({ error: listError.message });
  }

  if (!files || files.length === 0) {
    return res.status(200).json({ message: "Aucun fichier trouvé" });
  }

  console.log(`📂 ${files.length} fichiers trouvés`);

  const results: any[] = [];

  // 2️⃣ Parcourir tous les fichiers
  for (const file of files) {
    try {
      console.log(`⬇ Téléchargement de: ${file.name}`);

      // CORRECTION : Chemin correct
      const filePath = `cvs/${file.name}`;
      
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("truthtalent")
        .download(filePath);

      if (downloadError || !fileData) {
        console.error(`❌ Erreur téléchargement ${file.name}:`, downloadError);
        continue;
      }

      // 3️⃣ Lire le PDF
      const buffer = Buffer.from(await fileData.arrayBuffer());
      let pdfText = "";
      
      try {
        const parsed = await pdfParse(buffer);
        pdfText = parsed.text || "";
      } catch (parseError) {
        console.error(`❌ Erreur parsing PDF ${file.name}:`, parseError);
        continue;
      }

      console.log(`📄 ${file.name} extrait (200 premiers chars):`, pdfText.slice(0, 200));

      // 4️⃣ Construire les données Candidat CORRECTEMENT
      const candidat: Candidat = {
        // Propriétés obligatoires
        fichier: file.name, // ⬅️ CORRECTION : string, pas []
        nom: null,
        prenom: null,
        email: null,
        telephone: null,
        poste: null, // ⬅️ CORRECTION : string | null
        entreprise: null,
        profil: null,
        competences: [], // ⬅️ string[]
        metiers: [], // ⬅️ string[]
        formations: [], // ⬅️ any[]
        experiences: [], // ⬅️ any[]
        langues: [], // ⬅️ any[]
        adresse: null,
        linkedin: null,
        niveau: null,
        
        // Propriétés optionnelles
        postes: [], // ⬅️ string[] | undefined
        source_analyse: "storage_parser" // ⬅️ CORRECTION : string | undefined
      };

      // 5️⃣ Insertion en base
      const { error: insertError } = await supabase
        .from("candidats")
        .insert(candidat);

      if (insertError) {
        console.error(`❌ Erreur insertion DB (${file.name}):`, insertError);
      } else {
        console.log(`✅ Insertion OK pour ${file.name}`);
        results.push({ file: file.name, status: "OK" });
      }
    } catch (err: any) {
      console.error(`⚠️ Erreur générale pour ${file.name}:`, err.message);
    }
  }

  res.status(200).json({
    message: "Analyse terminée",
    fichiers_traites: results.length,
    details: results,
  });
});

// CORRECTION : Ajouter _ devant les paramètres non utilisés
export async function downloadFromStorage(_bucket: string, _path: string): Promise<Buffer> {
  // Implémentation simplifiée
  throw new Error("downloadFromStorage non implémentée");
  
  // Si vous voulez une vraie implémentation :
  /*
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path);

  if (error || !data) {
    throw new Error(`Erreur lors du téléchargement de ${path}: ${error?.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
  */
}

export default router;