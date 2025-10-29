// index.ts
// 
import express from "express";
import bodyParser from "body-parser";
import parseRouter from "./routes/parse";
import parseBulkRouter from "./routes/parse-bulk";
import jobStatusRouter from "./routes/job-status";
import candidatsRouter from "./routes/candidats";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Routes
app.use("/api/parse", parseRouter);
app.use("/api/parse-bulk", parseBulkRouter);
app.use("/api/job-status", jobStatusRouter);
app.use("/api/candidats", candidatsRouter);

app.listen(PORT, () => {
  console.log(`🚀 API TruthTalent running on render:${PORT}`);
});
