// pages/api/candidats.ts - VERSION CORRIGÉE
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Gestion CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }
    
    try {
        // UTILISER req.query pour les filtres éventuels
        const { limit, offset, statut } = req.query;
        
        console.log('📋 Récupération candidats', { limit, offset, statut });
        
        // Construire la requête avec des filtres
        let query = supabase.from('candidats').select('*');
        
        if (statut) {
            query = query.eq('statut', statut);
        }
        
        if (limit) {
            query = query.limit(parseInt(limit as string));
        }
        
        if (offset) {
            query = query.range(
                parseInt(offset as string),
                parseInt(offset as string) + (parseInt(limit as string) || 10) - 1
            );
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('❌ Erreur Supabase:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ ${data?.length || 0} candidats récupérés`);
        
        return res.status(200).json({
            success: true,
            data: data || [],
            count: data?.length || 0,
            timestamp: new Date().toISOString()
        });
        
    } catch (error: any) {
        console.error('💥 Erreur API candidats:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}