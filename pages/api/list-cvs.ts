// routes/list-cvs.ts
import { Router } from "express";
import { CVLister } from "../../services/cvLister";

const router = Router();
const cvLister = new CVLister();

// Lister tous les CVs
router.get("/", async (req, res) => {
  try {
    const { 
      limit = "50", 
      offset = "0",
      status 
    } = req.query;

    const cvs = await cvLister.listAllCVs({
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      status: status as string
    });

    const stats = await cvLister.getCVStats();

    res.json({
      success: true,
      data: cvs,
      stats: stats,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }
    });

  } catch (error: any) {
    console.error("❌ Erreur liste CVs:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Statistiques des CVs
router.get("/stats", async (_req, res) => {
  try {
    const stats = await cvLister.getCVStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;