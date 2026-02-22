import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { filePath } = req.body; // Exemple: "cv/nom-du-fichier.pdf"
    
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Téléchargement du fichier depuis le bucket "truthtalent"
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !fileData) throw new Error('Fichier introuvable dans le storage');

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 2. Analyse avec Gemini 2.0 Flash
    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: z.object({
        prenom: z.string(),
        nom: z.string(),
        email: z.string(),
        telephone: z.string().optional(),
        metier: z.string(),
        competences: z.array(z.string()),
        annees_experience: z.number(),
        formations: z.array(z.object({
          diplome: z.string(),
          ecole: z.string(),
          annee: z.string().optional()
        })),
        profil_resume: z.string()
      }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyse ce CV et extrais les informations structurées.' },
            { type: 'file', data: uint8Array, mimeType: 'application/pdf' }
          ]
        }
      ]
    });

    const candidate = result.object;

    // 3. Insertion dans la table Supabase "candidats"
    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    const { data: dbData, error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: candidate.nom,
        prenom: candidate.prenom,
        email: candidate.email,
        telephone: candidate.telephone,
        metiers: candidate.metier, // Attention au pluriel dans ta table
        competences: candidate.competences,
        formations: candidate.formations,
        annees_experience: candidate.annees_experience,
        profil: candidate.profil_resume,
        cv_url: publicUrl,
        fichier: filePath, // Clé unique pour éviter les doublons
        date_analyse: new Date().toISOString(),
        parse_status: 'completed'
      }, { 
        onConflict: 'fichier' 
      });

    if (dbError) throw dbError;

    return res.status(200).json({ 
      success: true, 
      message: "Analyse et sauvegarde réussies",
      data: candidate 
    });

  } catch (error: any) {
    console.error('Erreur API:', error);
    return res.status(500).json({ error: error.message });
  }
}