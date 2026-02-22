import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Supprime l'importation de Buffer si elle est manuelle, il est global en Node.js

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Gérer le CORS (ton code était bon)
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { filePath } = req.body;
    
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !fileData) throw new Error('Fichier introuvable');

    // CONVERSION CORRECTE POUR GEMINI 3.0 FLASH
    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const result = await generateObject({
      model: google('gemini-2.0-flash'), // Utilise bien 3.0 Flash
      schema: z.object({
        nom_complet: z.string(),
        email: z.string(),
        metier: z.string(),
        competences: z.array(z.string()),
        experience_annees: z.number(),
      }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraire les données du CV' },
            { type: 'file', data: uint8Array, mimeType: 'application/pdf' }
          ]
        }
      ]
    });

    return res.status(200).json(result.object);

  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}