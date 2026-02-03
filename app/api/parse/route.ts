import { NextRequest, NextResponse } from "next/server";
import { extractCVData } from "../../../services/documentParser";

export const runtime = "edge"; // Pour Vercel Edge Functions

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 },
      );
    }

    // Convertir File en Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extraire les données du CV
    const candidat = await extractCVData(buffer, file.name, null);

    return NextResponse.json({
      success: true,
      data: candidat,
      message: "CV analysé avec succès",
    });
  } catch (error: any) {
    console.error("Erreur API parse:", error);
    return NextResponse.json(
      {
        error: "Erreur lors de l'analyse du CV",
        details: error.message,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "API Parse CV - Utilisez POST avec un fichier",
    endpoints: {
      parse: "POST /api/parse",
      health: "GET /api/health",
    },
  });
}
