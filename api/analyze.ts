import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS & Sécurité
  res.setHeader('Access-Control-Allow-Origin', 'https://truthtalent.online');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { filePath } = req.body;
    
    // Initialisation Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Initialisation Gemini (SDK Natif)
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" }); 
// Juste pour vérifier si le projet répond

    // 2. Récupération du fichier
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError || !fileData) throw new Error('Fichier introuvable dans le storage');

    const arrayBuffer = await fileData.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    // 3. Analyse avec Prompt JSON strict
    const prompt = `Analyse ce CV et retourne UNIQUEMENT un objet JSON (sans balises markdown) avec ce format exact :
    {
      "prenom": "string",
      "nom": "string",
      "email": "string",
      "telephone": "string",
      "metier": "string",
      "annees_experience": number,
      "competences": ["string"],
      "profil_resume": "string",
      "formations": ["string"]
    }`;

    const result = await model.generateContent([
      { inlineData: { data: base64Data, mimeType: "application/pdf" } },
      { text: prompt }
    ]);

    const responseText = result.response.text();
    // Nettoyage au cas où Gemini ajoute des ```json ... ```
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    const candidate = JSON.parse(cleanJson);

    // 4. Insertion dans ta table Supabase
    const publicUrl = supabase.storage.from('truthtalent').getPublicUrl(filePath).data.publicUrl;

    const { error: dbError } = await supabase
      .from('candidats')
      .upsert({
        nom: candidate.nom,
        prenom: candidate.prenom,
        email: candidate.email,
        telephone: candidate.telephone,
        metiers: candidate.metier,
        competences: candidate.competences,
        formations: candidate.formations,
        annees_experience: candidate.annees_experience,
        profil: candidate.profil_resume,
        cv_url: publicUrl,
        fichier: filePath,
        date_analyse: new Date().toISOString(),
        parse_status: 'completed'
      }, { 
        onConflict: 'fichier' 
      });

    if (dbError) throw dbError;

    return res.status(200).json({ success: true, data: candidate });

  } catch (error: any) {
    console.error('Erreur:', error.message);
    return res.status(500).json({ error: error.message });
  }
}