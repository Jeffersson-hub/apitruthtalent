import express from 'express';
import handler from './api/analyze.ts'; // On pointe vers le .ts

const app = express();
app.use(express.json());

// Route pour l'analyse
app.post('/api/analyze', async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur Render actif sur le port ${PORT}`);
});