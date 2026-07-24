// server.mjs - Version ES Module pour Render
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurer le worker local
const workerPath = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

const app = express();

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ============================================
// FONCTIONS D'EXTRACTION
// ============================================
async function extractTextFromPDF(arrayBuffer) {
  try {
    const loadingTask = pdfjsLib.getDocument({ 
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
      disableWorker: true
    });
    const pdf = await loadingTask.promise;
    let fullContent = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const items = content.items;
      items.sort((a, b) => {
        if (Math.abs(b.transform[5] - a.transform[5]) > 5) {
          return b.transform[5] - a.transform[5];
        }
        return a.transform[4] - b.transform[4];
      });

      let lastY = -1;
      let pageText = "";
      for (const item of items) {
        if (lastY !== -1 && Math.abs(lastY - item.transform[5]) > 5) {
          pageText += "\n";
        }
        pageText += item.str + " ";
        lastY = item.transform[5];
      }
      fullContent.push(pageText);
    }
    return fullContent.join("\n--- PAGE ---\n");
  } catch (error) {
    console.error("❌ Erreur extraction PDF:", error);
    throw error;
  }
}

// ============================================
// ROUTE D'ANALYSE
// ============================================
app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "filePath requis" });
    }

    console.log("📁 Fichier à analyser:", filePath);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Télécharger le fichier
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('truthtalent')
      .download(filePath);

    if (downloadError) {
      console.error("❌ Erreur téléchargement:", downloadError);
      throw downloadError;
    }

    const arrayBuffer = await fileData.arrayBuffer();
    let rawText = "";

    // Extraire le texte
    if (filePath.toLowerCase().endsWith('.pdf')) {
      rawText = await extractTextFromPDF(arrayBuffer);
    } else {
      throw new Error("Format non supporté. Utilisez PDF.");
    }

    if (!rawText.trim()) {
      throw new Error("Extraction impossible : texte vide.");
    }

    console.log("📝 Texte extrait (premiers caractères):", rawText.substring(0, 200));

    // Extraction des contacts
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/);

    // Structure de réponse
    const finalData = {
      nom: "Inconnu",
      prenom: "Inconnu",
      email: emailMatch ? emailMatch[0] : null,
      telephone: phoneMatch ? phoneMatch[0].replace(/[\s.-]/g, '') : null,
      niveau: null,
      metiers: [],
      competences: [],
      experiences: [],
      annees_experience: 0,
      niveau_experience: 'Junior',
      fichier: filePath,
      raw_text: rawText
    };

    console.log("✅ Analyse terminée pour:", finalData.email || finalData.nom);

    return res.status(200).json({ 
      success: true, 
      data: finalData
    });

  } catch (error) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "Erreur interne" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Render en écoute sur le port ${PORT}`);
});