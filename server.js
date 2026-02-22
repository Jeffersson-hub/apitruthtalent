import express from 'express';
import handler from './api/analyze.js'; // Note l'extension .js ici
import { express as vExpress } from '@vercel/node';

const app = express();
app.use(express.json());

// On simule le comportement de Vercel pour Render
app.post('/api/analyze', async (req, res) => {
  await handler(req, res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur TruthTalent actif sur le port ${PORT}`);
});