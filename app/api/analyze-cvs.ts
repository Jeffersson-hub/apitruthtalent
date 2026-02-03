// pages/api/analyze-cvs.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Gestion CORS directement
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Vérifier la méthode
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  
  try {
    console.log('🚀 Démarrage analyse des CVs...');
    
    // UTILISEZ req pour éviter le warning TypeScript
    const { action, limit } = req.body || {};
    console.log('Action demandée:', action || 'default');
    console.log('Limite:', limit || 'aucune');
    
    // Votre logique d'analyse ici...
    // Par exemple, traiter les CVs en attente
    
    return res.status(200).json({
      success: true,
      message: 'Analyse des CVs démarrée',
      action,
      limit,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('❌ Erreur analyse:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}