import { NextRequest, NextResponse } from "next/server";
import { parseCV } from "../../../services/documentParser";

// Runtime adaptatif : Node.js pour parsing lourd
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // Upload direct de fichier
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 },
        );
      }

      const buffer = await file.arrayBuffer();
      const result = await parseCV(buffer, file.name, file.type);

      return NextResponse.json(
        {
          success: true,
          data: result,
          processed_at: new Date().toISOString(),
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
        },
      );
    } else {
      // JSON avec URL
      const body = await request.json();
      const { file_url, filename = "cv.pdf", mime_type } = body;

      if (!file_url) {
        return NextResponse.json(
          { error: "file_url is required" },
          { status: 400 },
        );
      }

      // Télécharger depuis URL
      const response = await fetch(file_url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const result = await parseCV(buffer, filename, mime_type);

      return NextResponse.json(
        {
          success: true,
          data: result,
          processed_at: new Date().toISOString(),
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
        },
      );
    }
  } catch (error: any) {
    console.error("API Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      },
    );
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
