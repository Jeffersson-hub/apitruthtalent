// api/analyze.ts (ou analyze.js si vous préférez JS)
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Schéma de validation Zod (ce que Gemini doit extraire)
const ResumeSchema = z.object({
  nom_complet: z.string(),
  email: z.string().email(),
  telephone: z.string().optional(),
  metier: z.string(),
  competences: z.array(z.string()),
  diplome: z.string(),
  experience_annees: z.number()
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'filePath requis' });
    }

    // 1. Télécharger le fichier depuis Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !fileData) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // 2. Convertir le PDF en texte (ou base64 pour Gemini)
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64PDF = buffer.toString('base64');

    // 3. Appel à Gemini avec Vercel AI SDK
    const result = await generateObject({
      model: google('gemini-3-flash'),
      schema: ResumeSchema,
      prompt: `Analyse ce CV (fichier PDF en base64) et extrais les informations demandées.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extrais les informations de ce CV' },
            { 
              type: 'file', 
              data: base64PDF, 
              mimeType: 'application/pdf' 
            }
          ]
        }
      ]
    });

    // 4. Formater pour votre base de données
    const { object: extracted } = result;
    const nameParts = extracted.nom_complet.split(' ');

    const candidate = {
      nom: nameParts[nameParts.length - 1],
      prenom: nameParts[0],
      email: extracted.email,
      telephone: extracted.telephone || null,
      metier: extracted.metier,
      competences: extracted.competences,
      niveau: extracted.diplome,
      annees_experience: extracted.experience_annees,
      cv_url: `${process.env.SUPABASE_URL}/storage/v1/object/public/truthtalent/${filePath}`,
      cv_filename: filePath.split('/').pop(),
      fichier: filePath
    };

    // Niveau d'expérience
    const exp = candidate.annees_experience;
    candidate['niveau_experience'] = 
      exp < 2 ? 'junior' :
      exp < 5 ? 'intermédiaire' :
      exp < 10 ? 'confirmé' : 'senior';

    return res.status(200).json({ success: true, candidateInfo: candidate });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Erreur inconnue' 
    });
  }
}