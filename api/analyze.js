import { createClient } from '@supabase/supabase-js';
import pdf from 'pdf-parse';
import cors from 'cors';
import { analyzeText } from '../lib/ats-analyzer';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const handler = async (req, res) => {
  await cors()(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { resumeUrl, jobDescription } = req.body;
      const fileName = resumeUrl.split('/').pop();
      const { data: file, error } = await supabase.storage
        .from('resumes')
        .download(fileName);

      if (error) throw error;

      const buffer = await file.arrayBuffer();
      const pdfData = await pdf(Buffer.from(buffer));
      const atScore = analyzeText(pdfData.text, jobDescription);

      res.status(200).json({
        score: atScore.score,
        missingKeywords: atScore.missingKeywords,
        summary: pdfData.text.substring(0, 500)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};

export default handler;
