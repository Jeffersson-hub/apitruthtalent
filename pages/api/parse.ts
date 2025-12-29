// pages/api/parse.ts - VERSION OPTIMISÉE POUR VERCEL
import { NextApiRequest, NextApiResponse } from 'next';
import fetch from "node-fetch";

// pages/api/parse-cv.ts

//import { createClient } from '@supabase/supabase-js';

/* const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
); */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS simple
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  
  try {
    const { file_url, file_path } = req.body;
    
    if (!file_url && !file_path) {
      return res.status(400).json({ error: 'URL du fichier requise' });
    }
    
    console.log('🚀 Appel Edge Function...');
    
    // Appel direct à votre Edge Function
    const edgeResponse = await fetch(
      'https://cpdokjsyxmohubgvxift.supabase.co/functions/v1/parse-cv',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ file_url, file_path })
      }
    );
    
    const result = await edgeResponse.json();
    
    /* if (!edgeResponse.ok) {
      throw new Error(result.error || 'Erreur Edge Function');
    } */
    
    return res.status(200).json(result);
    
  } catch (error: any) {
    console.error('❌ Erreur API:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'API_ERROR'
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
};