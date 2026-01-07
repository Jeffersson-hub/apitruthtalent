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

    // Ici, vous pouvez appeler Parseur ou autre service
    // Pour l'instant, retourne une réponse de test

    res.status(200).json({
      success: true,
      message: 'CV parsing endpoint',
      file_url: file_url,
      data: {
        nom: 'Test',
        prenom: 'Candidat',
        email: 'test@example.com',
        telephone: '0123456789',
        metiers: ['Développeur', 'Ingénieur'],
        postes: ['Lead Developer', 'Software Engineer']
      }
    });

  } catch (error: any) {
    console.error('Parse error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}