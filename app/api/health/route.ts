// app/api/health/route.ts
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "TruthTalent CV Parser",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    features: [
      "PDF parsing",
      "DOCX parsing",
      "NER extraction",
      "Experience parsing",
      "Skill matching",
    ],
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
