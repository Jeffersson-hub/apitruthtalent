// pages/api/upload.ts
// 
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../utils/supabase';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const form = new formidable.IncomingForm();
    form.parse(req, async (err, _fields, files) => {
        if (err) return res.status(500).json({ error: err.message });

        const uploadedFiles: string[] = [];

        const fileList = Array.isArray(files.file) ? files.file : [files.file];
        for (const file of fileList) {
            const f = file as formidable.File;
            const fileBuffer = fs.readFileSync(f.filepath);

            const { data, error } = await supabase.storage
                .from('truthtalent')
                .upload(`cvs/${f.originalFilename}`, fileBuffer, { upsert: true });

            if (error) return res.status(500).json({ error: error.message });

            uploadedFiles.push(data.path);
        }
        res.status(200).json({ message: 'Envoi terminé', files: uploadedFiles });
    });
}
