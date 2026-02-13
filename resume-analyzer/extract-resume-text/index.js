// resume-analyzer/extract-resume-text/index.js
const { analyzeResume } = require('./resume-analyzer');

exports.handler = async (event) => {
  try {
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
