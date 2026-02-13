import { createClient } from '@supabase/supabase-js';
import cors from 'cors';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    db: { schema: 'public' },
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

const handler = async (req, res) => {
  await cors()(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const file = req.body.file;
      const fileName = `cv-${Date.now()}.pdf`;
      const { data, error } = await supabase.storage
        .from('resumes')
        .upload(fileName, file, { contentType: 'application/pdf' });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);

      res.status(200).json({ url: publicUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};

export default handler;
