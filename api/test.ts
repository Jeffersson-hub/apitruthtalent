// api/test.ts
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ 
    success: true, 
    message: '✅ API Vercel fonctionne !',
    timestamp: new Date().toISOString()
  });
}