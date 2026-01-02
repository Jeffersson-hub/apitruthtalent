#!/usr/bin/env ts-node
import 'dotenv/config';
import { processJobs } from '../services/jobWorker';

async function main() {
  try {
    console.log('▶️ Worker démarré', new Date().toISOString());
    await processJobs();
    console.log('✅ Worker terminé', new Date().toISOString());
  } catch (err: any) {
    console.error('❌ Erreur worker:', err);
    process.exit(1);
  }
}

main();