import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  res.status(200).json({
    status: 'ok',
    service: 'TruthTalent CV Parser API',
    version: '2.0.0',
    supported_formats: ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'],
    timestamp: new Date().toISOString()
  });
}