// resume-analyzer/extract-resume-text/index.cjs
const { analyzeResume } = require('./resume-analyzer');
import { createClient } from '@supabase/supabase-js';

// Initialiser Supabase (ajoutez vos variables d'environnement)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  try {
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event;
    } catch (e) {
      body = event;
    }
    
    const { filePath, jobDescription } = JSON.parse(event.body);

    // 1. Télécharger le fichier depuis Supabase (ou S3)
    const fileBuffer = await downloadFileFromSupabase(filePath);

    // 2. Analyser le CV avec resume-analyzer
    const analysis = await analyzeResume(fileBuffer, jobDescription);

    // 3. Retourner le résultat
    return {
      statusCode: 200,
      body: JSON.stringify(analysis)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Fonction pour télécharger depuis Supabase
async function downloadFileFromSupabase(filePath) {
  const { data, error } = await supabase.storage
    .from('truthtalent')
    .download(filePath);

  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}
