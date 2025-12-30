// pages/api/parse.ts - VERSION CORRIGÉE
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import { promisify } from 'util';
import { extractCVData } from '../../services/documentParser';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import crypto from 'crypto';

const readFile = promisify(fs.readFile);

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function cleanTextForDatabase(text: string): string {
  if (!text) return '';
  
  // Supprimer les caractères nuls et autres caractères problématiques
  return text
    .replace(/\x00/g, '') // Supprimer les caractères nuls
    .replace(/\\u0000/g, '') // Supprimer les séquences Unicode nulles
    .replace(/[^\x20-\x7E\u00C0-\u017F\n\r\t]/g, ' ') // Garder seulement les caractères imprimables
    .replace(/\s+/g, ' ') // Normaliser les espaces
    .trim();
}

function generateUniqueId(filename: string): string {
  const hash = crypto.createHash('md5').update(filename + Date.now()).digest('hex').substring(0, 12);
  return `cv_${hash}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });
  
  try {
    const contentType = req.headers['content-type'] || '';
    let file_url = '';
    let fileBuffer: Buffer;
    let filename = 'cv';
    
    if (contentType.includes('application/json')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      const data = JSON.parse(body);
      file_url = data.file_url;
      
      if (!file_url) {
        return res.status(400).json({ error: 'URL manquante' });
      }
      
      console.log(`📄 Téléchargement depuis Supabase: ${file_url}`);
      
      const response = await fetch(file_url);
      if (!response.ok) throw new Error(`Échec téléchargement: ${response.status}`);
      
      // Utiliser arrayBuffer() au lieu de buffer()
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      filename = file_url.split('/').pop() || 'cv';
      
    } else if (contentType.includes('multipart/form-data')) {
      const form = new IncomingForm();
      const [, files] = await new Promise<[any, any]>((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve([fields, files]);
        });
      });
      
      const file = files.file as any;
      if (!file) return res.status(400).json({ error: 'Fichier manquant' });
      
      filename = file.originalFilename || file.newFilename;
      fileBuffer = await readFile(file.filepath);
      fs.unlinkSync(file.filepath);
      
    } else {
      return res.status(400).json({ error: 'Content-Type non supporté' });
    }
    
    // Extraire les données
    const extractedData = await extractCVData(fileBuffer, filename, supabase);
    console.log(`✅ Données extraites:`, {
      nom: extractedData.nom,
      prenom: extractedData.prenom,
      email: extractedData.email,
      metiers: extractedData.metiers
    });
    
    // Créer un identifiant unique
    const uniqueId = generateUniqueId(filename);
    
    // Nettoyer le texte brut pour la base de données
    const rawText = fileBuffer.toString('utf8', 0, 5000);
    const cleanRawText = cleanTextForDatabase(rawText);
    
    // Préparer les données pour Supabase
    const candidatData: any = {
      nom: extractedData.nom || '',
      prenom: extractedData.prenom || '',
      email: extractedData.email || null,
      telephone: extractedData.telephone || null,
      metiers: extractedData.metiers || 'À déterminer',
      postes: extractedData.postes || 'À déterminer',
      entreprise: extractedData.entreprise || 'À déterminer',
      profil: extractedData.profil || `CV ${filename}`,
      
      // Champs additionnels
      fichier: uniqueId,
      cv_url: file_url,
      cv_filename: filename,
      raw_text: cleanRawText,
      
      // Niveau et expérience
      niveau: extractedData.niveau || 'À déterminer',
      
      // Compétences et formations
      competences: extractedData.competences || [],
      formations: extractedData.formations || [],
      experiences: extractedData.experiences || [],
      langues: extractedData.langues || [],
      
      // Timestamps
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Ajouter annees_experience seulement s'il existe
    if (extractedData.annees_experience !== undefined) {
      candidatData.annees_experience = extractedData.annees_experience;
    }
    
    // SAUVEGARDER DANS SUPABASE
    console.log('💾 Sauvegarde dans Supabase...');
    const { data, error } = await supabase
      .from('candidats')
      .upsert(candidatData, { onConflict: 'fichier' })
      .select()
      .single();
    
    if (error) {
      console.error('❌ Erreur sauvegarde Supabase:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        extraction: extractedData
      });
    }
    
    console.log(`✅ Candidat sauvegardé avec ID: ${data.id}`);
    
    // Retourner les données
    return res.status(200).json({
      success: true,
      candidat_id: data.id,
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
      message: 'CV analysé et sauvegardé avec succès'
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