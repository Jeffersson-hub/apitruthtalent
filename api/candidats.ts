// pages/api/candidats.ts - VERSION CORRIGÉE
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../utils/supabase';

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
        // Récupérer TOUS les paramètres de filtre
        const { 
            limit = '100', 
            offset = '0', 
            statut,
            min_exp,  // NOUVEAU: expérience minimale
            max_exp,  // NOUVEAU: expérience maximale
            type_exp, // NOUVEAU: type (junior/senior/etc)
            search    // NOUVEAU: recherche texte
        } = req.query;
        
        console.log('📋 Récupération candidats avec filtres:', { 
            limit, offset, statut, min_exp, max_exp, type_exp, search 
        });
        
        // Construire la requête
        let query = supabase
            .from('candidats')
            .select('*', { count: 'exact' }); // Ajout du count
        
        // FILTRES EXISTANTS
        if (statut) {
            query = query.eq('statut', statut);
        }
        
        // NOUVEAUX FILTRES PAR EXPERIENCE
        if (min_exp) {
            query = query.gte('annees_experience', parseFloat(min_exp as string));
        }
        
        if (max_exp) {
            query = query.lte('annees_experience', parseFloat(max_exp as string));
        }
        
        // Filtres rapides par type
        if (type_exp) {
            switch(type_exp) {
                case 'junior':
                    query = query.lte('annees_experience', 5);
                    break;
                case 'intermediaire':
                    query = query.gte('annees_experience', 5).lte('annees_experience', 15);
                    break;
                case 'senior':
                    query = query.gte('annees_experience', 15);
                    break;
            }
        }
        
        // Recherche texte (nom, prénom, compétences)
        if (search) {
            query = query.or(`
                nom.ilike.%${search}%,
                prenom.ilike.%${search}%,
                competences.ilike.%${search}%,
                metiers.ilike.%${search}%,
                postes.ilike.%${search}%
            `);
        }
        
        // Pagination
        const limitNum = parseInt(limit as string);
        const offsetNum = parseInt(offset as string);
        
        query = query
            .order('annees_experience', { ascending: false })
            .range(offsetNum, offsetNum + limitNum - 1);
        
        const { data, error, count } = await query;
        
        if (error) {
            console.error('❌ Erreur Supabase:', error);
            return res.status(500).json({ error: error.message });
        }

        console.log(`✅ ${data?.length || 0} candidats récupérés (total: ${count})`);
        
        // Si pas de données mais filtre par expérience, on peut calculer à la volée
        // (pour les anciens candidats qui n'ont pas encore la colonne)
        if ((min_exp || max_exp || type_exp) && (!data || data.length === 0)) {
            console.log('⚠️ Filtre par expérience mais colonne annees_experience peut être vide');
        }
        
        return res.status(200).json({
            success: true,
            data: data || [],
            count: data?.length || 0,
            total: count || 0,
            pagination: {
                page: Math.floor(offsetNum / limitNum) + 1,
                limit: limitNum,
                totalPages: Math.ceil((count || 0) / limitNum)
            },
            filters: {
                min_exp: min_exp ? parseFloat(min_exp as string) : undefined,
                max_exp: max_exp ? parseFloat(max_exp as string) : undefined,
                type_exp,
                search
            },
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