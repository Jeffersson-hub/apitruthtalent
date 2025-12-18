// pages/api/parse-enhanced.ts - MODIFICATION
import { NextApiRequest, NextApiResponse } from 'next';
import { LocalAffindaService } from '../../services/localAffindaService';
import { getFileFromStorage } from '../../services/storage';
import { calculateTotalExperience } from '../../utils/experience-calculator'; // ✅ Déjà présent

const localAffindaService = new LocalAffindaService();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Gérer CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { file_path } = req.body;
    
    if (!file_path) {
      return res.status(400).json({ error: 'file_path is required' });
    }

    console.log('🔍 Analyse locale du CV:', file_path);

    // 1. Récupérer le fichier depuis le storage
    const fileBuffer = await getFileFromStorage(file_path);
    
    // 2. Analyser localement avec la logique Affinda
    const candidateData = await localAffindaService.analyzeCV(
      fileBuffer, 
      file_path.split('/').pop() || 'cv.pdf',
      `https://cpdokjsyxmohubgvxift.supabase.co/storage/v1/object/public/truthtalent/${file_path}`
    );

    // 3. ✅ AJOUTER LE CALCUL D'EXPÉRIENCE
    const annees_experience = calculateTotalExperience(candidateData.experiences || []);
    
    // 4. Ajouter le champ calculé aux données
    const candidateDataWithExperience = {
      ...candidateData,
      annees_experience: annees_experience, // ✅ NOUVEAU CHAMP
      derniere_maj_experience: new Date().toISOString()
    };

    console.log(`📊 Expérience calculée: ${annees_experience} ans pour ${candidateData.prenom} ${candidateData.nom}`);

    // 5. Insérer dans Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const { data, error } = await supabase
      .from('candidats')
      .insert(candidateDataWithExperience) // ✅ Insérer avec expérience
      .select()
      .single();

    if (error) {
      // Gestion des doublons
      if (error.code === '23505') {
        console.log('🔄 Doublon détecté, mise à jour...');
        
        const { data: updatedData, error: updateError } = await supabase
          .from('candidats')
          .update(candidateDataWithExperience) // ✅ Mettre à jour avec expérience
          .eq('email', candidateData.email)
          .select()
          .single();

        if (updateError) throw updateError;
        
        return res.status(200).json({
          success: true,
          candidat: updatedData,
          annees_experience: annees_experience, // ✅ Inclure dans la réponse
          message: 'CV analysé et candidat mis à jour'
        });
      }
      throw error;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      success: true,
      candidat: data,
      annees_experience: annees_experience, // ✅ Inclure dans la réponse
      message: 'CV analysé localement avec succès'
    });

  } catch (error: any) {
    console.error('❌ Erreur analyse locale:', error);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}