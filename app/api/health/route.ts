import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "CV Parser API",
    version: "1.0.0",
  });
}
