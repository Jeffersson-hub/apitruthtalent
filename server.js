// server.js - Pour Render
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Importer la fonction d'analyse depuis analyze.ts (compilé)
// OU réécrire en JavaScript

app.post('/api/analyze', async (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "filePath requis" });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // ... code d'analyse (le même que dans analyze.ts)
    
    return res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error("❌ Erreur:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Render en écoute sur le port ${PORT}`);
});