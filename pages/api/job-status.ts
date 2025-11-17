import { Router } from "express";
import { supabase } from "../../utils/supabase";

const router = Router();

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
    if (error) throw error;

    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
