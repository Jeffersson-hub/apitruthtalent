// api/analyze.ts - Version Vercel avec pdf-parse
import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
// @ts-ignore - pdf-parse n'a pas de types
import pdfParse from 'pdf-parse';

// Même code que ci-dessus mais en TypeScript