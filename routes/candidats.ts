
import { Router } from "express";
import { supabase } from "../utils/supabase";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase.from("candidats").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
