// app/api/health/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'CV Parser API',
    version: '1.0.0',
    endpoints: [
      { path: '/api/parse', method: 'POST', description: 'Parser un CV' },
      { path: '/api/health', method: 'GET', description: 'Vérifier le statut' }
    ]
  });
}