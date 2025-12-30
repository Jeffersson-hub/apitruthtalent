// pages/api/parse.ts - VERSION RECEVANT LES FILES
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { promisify } from 'util';
import { extractCVData } from '../../services/documentParser';
import { createClient } from '@supabase/supabase-js';

const readFile = promisify(fs.readFile);

// Désactiver le bodyParser par défaut
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  
  try {
    // Parser le form data avec formidable
    const form = new IncomingForm();
    
    const [files] = await new Promise<[any, any]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });
    
    const file = files.file as any;
    
    if (!file) {
      return res.status(400).json({ error: 'Fichier manquant' });
    }
    
    const filename = file.originalFilename || file.newFilename;
    console.log(`📄 Analyse du fichier: ${filename}`);
    
    // Lire le fichier
    const fileBuffer = await readFile(file.filepath);
    
    // Extraire les données
    const extractedData = await extractCVData(fileBuffer, filename, supabase);
    
    console.log(`✅ Données extraites:`, {
      nom: extractedData.nom,
      prenom: extractedData.prenom,
      email: extractedData.email,
      metiers: extractedData.metiers
    });
    
    // Nettoyer le fichier temporaire
    fs.unlinkSync(file.filepath);
    
    return res.status(200).json({
      success: true,
      candidat: extractedData,
      filename,
      message: 'CV analysé avec succès'
    });
    
  } catch (error: any) {
    console.error('❌ Erreur API parse:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'PARSE_ERROR'
    });
  }
}