// index.ts - VERSION CORRIGÉE
import express from "express";
import bodyParser from "body-parser";
import parseRouter from "./routes/parse";
import parseEnhancedRouter from "./routes/parse-enhanced"; // NOUVEAU
import parseBulkRouter from "./routes/parse-bulk";
import jobStatusRouter from "./routes/job-status";
import candidatsRouter from "./routes/candidats";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use("/api/parse", parseRouter);
app.use("/api/parse-enhanced", parseEnhancedRouter); // NOUVEAU
app.use("/api/parse-bulk", parseBulkRouter);
app.use("/api/job-status", jobStatusRouter);
app.use("/api/candidats", candidatsRouter);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    service: "Truth Talent Parser API"
  });
});

// Route de test simple
app.get("/", (req, res) => {
  res.json({ 
    message: "API Truth Talent Parser - Améliorée",
    version: "2.0.0",
    endpoints: [
      "POST /api/parse-enhanced/enhanced - Parsing amélioré des CVs",
      "POST /api/parse-enhanced/test - Test de parsing sur un CV",
      "GET /health - Statut de l'API"
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API TruthTalent améliorée démarrée sur le port ${PORT}`);
  console.log(`📊 Endpoints disponibles:`);
  console.log(`   - POST /api/parse-enhanced/enhanced → Parsing amélioré`);
  console.log(`   - POST /api/parse-enhanced/test → Test de parsing`);
  console.log(`   - GET /health → Statut de l'API`);
});