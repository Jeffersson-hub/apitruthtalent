// pages/api/parse.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file_url } = req.body;

    if (!file_url) {
      return res.status(400).json({
        success: false,
        error: 'file_url is required'
      });
    }

    
  } catch (error: any) {
    console.error('Parse error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}