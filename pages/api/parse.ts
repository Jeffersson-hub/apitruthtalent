// pages/api/parse.ts - VERSION CORRIGÉE
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { promisify } from 'util';
import { extractCVData } from '../../services/documentParser';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  
  try {
    const contentType = req.headers['content-type'] || '';
    
    // OPTION A: Si c'est du JSON (appel du dashboard)
    if (contentType.includes('application/json')) {
      // On doit récupérer le body manuellement
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      const { file_url } = JSON.parse(body);
      
      if (!file_url) {
        return res.status(400).json({ error: 'URL manquante' });
      }
      
      console.log(`📄 Téléchargement depuis: ${file_url}`);
      
      // Télécharger le fichier depuis Supabase
      const response = await fetch(file_url);
      if (!response.ok) {
        throw new Error(`Échec téléchargement: ${response.status}`);
      }
      
      const buffer = await response.buffer();
      const filename = file_url.split('/').pop() || 'cv';
      
      // Extraire les données
      const extractedData = await extractCVData(buffer, filename, supabase);
      
      // Retourner uniquement les données demandées
      return res.status(200).json({
        success: true,
        candidat: {
          nom: extractedData.nom || '',
          prenom: extractedData.prenom || '',
          email: extractedData.email || null,
          telephone: extractedData.telephone || null,
          metiers: extractedData.metiers || 'À déterminer',
          postes: extractedData.postes || 'À déterminer',
          entreprise: extractedData.entreprise || 'À déterminer',
          profil: extractedData.profil || `CV ${filename}`
        },
        filename,
        message: 'CV analysé avec succès'
      });
    }
    
    // OPTION B: Si c'est FormData (upload direct)
    else if (contentType.includes('multipart/form-data')) {
      const form = new IncomingForm();
      
      const [, files] = await new Promise<[any, any]>((resolve, reject) => {
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
      console.log(`📄 Analyse du fichier uploadé: ${filename}`);
      
      // Lire le fichier
      const fileBuffer = await readFile(file.filepath);
      
      // Extraire les données
      const extractedData = await extractCVData(fileBuffer, filename, supabase);
      
      // Nettoyer le fichier temporaire
      fs.unlinkSync(file.filepath);
      
      // Retourner uniquement les données demandées
      return res.status(200).json({
        success: true,
        candidat: {
          nom: extractedData.nom || '',
          prenom: extractedData.prenom || '',
          email: extractedData.email || null,
          telephone: extractedData.telephone || null,
          metiers: extractedData.metiers || 'À déterminer',
          postes: extractedData.postes || 'À déterminer',
          entreprise: extractedData.entreprise || 'À déterminer',
          profil: extractedData.profil || `CV ${filename}`
        },
        filename,
        message: 'CV analysé avec succès'
      });
    }
    
    else {
      return res.status(400).json({ error: 'Content-Type non supporté' });
    }
    
  } catch (error: any) {
    console.error('❌ Erreur API parse:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      code: 'PARSE_ERROR'
    });
  }
}