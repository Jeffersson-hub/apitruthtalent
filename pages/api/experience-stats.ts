// pages/api/experience-stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // CORS
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
        console.log('📊 Récupération des statistiques d\'expérience');
        
        // 1. Statistiques générales
        const { data: stats, error: statsError } = await supabase
            .from('candidats')
            .select('annees_experience')
            .not('annees_experience', 'is', null);
        
        if (statsError) throw statsError;
        
        // Calcul des statistiques
        const experiences = stats?.map(s => s.annees_experience).filter(Boolean) || [];
        
        const statsCalculated = {
            total_candidats: experiences.length,
            moyenne: experiences.length > 0 
                ? Math.round((experiences.reduce((a, b) => a + b, 0) / experiences.length) * 10) / 10 
                : 0,
            min: experiences.length > 0 ? Math.min(...experiences) : 0,
            max: experiences.length > 0 ? Math.max(...experiences) : 0,
            mediane: experiences.length > 0 
                ? calculateMedian(experiences)
                : 0
        };
        
        // 2. Distribution par niveau
        const { data: distribution, error: distError } = await supabase
            .rpc('get_experience_distribution');
        
        // Si la fonction RPC n'existe pas, on la calcule manuellement
        let distributionData;
        if (distError) {
            distributionData = calculateDistribution(experiences);
        } else {
            distributionData = distribution;
        }
        
        // 3. Top des expériences
        const { data: topCandidats, error: topError } = await supabase
            .from('candidats')
            .select('id, nom, prenom, annees_experience, postes')
            .not('annees_experience', 'is', null)
            .order('annees_experience', { ascending: false })
            .limit(10);
        
        return res.status(200).json({
            success: true,
            stats: statsCalculated,
            distribution: distributionData,
            top_experiences: topCandidats || [],
            timestamp: new Date().toISOString()
        });
        
    } catch (error: any) {
        console.error('💥 Erreur stats expérience:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// Fonctions utilitaires
function calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    
    return sorted[middle];
}

function calculateDistribution(experiences: number[]): any[] {
    const ranges = [
        { label: '0-2 ans', min: 0, max: 2 },
        { label: '3-5 ans', min: 3, max: 5 },
        { label: '6-10 ans', min: 6, max: 10 },
        { label: '11-15 ans', min: 11, max: 15 },
        { label: '15+ ans', min: 15, max: 999 }
    ];
    
    return ranges.map(range => {
        const count = experiences.filter(exp => 
            exp >= range.min && exp <= range.max
        ).length;
        
        return {
            range: range.label,
            count,
            percentage: experiences.length > 0 
                ? Math.round((count / experiences.length) * 1000) / 10 
                : 0
        };
    });
}