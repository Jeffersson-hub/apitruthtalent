import { NextApiRequest, NextApiResponse } from "next";
import { AffindaEnhancedService } from "../../services/affindaEnhancedService";

const affindaService = new AffindaEnhancedService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Gérer CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await affindaService.processAffindaWebhook(req.body);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(result);
  } catch (error: any) {
    console.error("❌ Erreur webhook Affinda:", error);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
