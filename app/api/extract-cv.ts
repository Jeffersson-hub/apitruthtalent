// pages/api/extract-cv.ts
import { NextApiRequest, NextApiResponse } from "next";
import { LightNERService } from "../../services/nerService";

const nerService = new LightNERService(
  process.env.NER_SERVICE_URL || "http://localhost:10000",
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== "string" || text.length < 10) {
      return res.status(400).json({ error: "Text too short or invalid" });
    }

    const result = await nerService.extractEntities(text);

    return res.status(200).json(result);
  } catch (error: unknown) {
    console.error("Extraction error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return res.status(500).json({
      error: "Extraction failed",
      details: errorMessage,
    });
  }
}
