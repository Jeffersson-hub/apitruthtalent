import { Router } from "express";
import { supabase } from "../utils/supabase";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files[] manquant" });
    }

    // Créer un job en DB
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        status: "pending",
        total: files.length,
        processed: 0,
        files
      })
      .select()
      .single();

    if (error) throw error;

    res.status(200).json({ ok: true, jobId: data.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
