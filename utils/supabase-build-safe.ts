// utils/supabase-build-safe.ts
import { createClient } from '@supabase/supabase-js';

// Version sécurisée pour le build
export function createSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Si les variables manquent, retourner un client mock
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('🔧 Création client Supabase mock pour le build');
    
    return {
      from: (table: string) => ({
        select: (columns?: string) => Promise.resolve({ data: [], error: null }),
        insert: (data: any) => Promise.resolve({ data: null, error: null }),
        update: (data: any) => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
        eq: (column: string, value: any) => ({
          select: () => Promise.resolve({ data: [], error: null }),
          update: () => Promise.resolve({ data: null, error: null }),
          delete: () => Promise.resolve({ data: null, error: null }),
        })
      }),
      rpc: (fn: string, params?: any) => Promise.resolve({ data: null, error: null }),
      storage: {
        from: (bucket: string) => ({
          list: () => Promise.resolve({ data: [], error: null }),
          download: (path: string) => Promise.resolve({ data: null, error: null }),
          upload: () => Promise.resolve({ data: null, error: null }),
        })
      }
    } as any;
  }
  
  // Sinon, créer le vrai client
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
}

export const supabase = createSupabaseClient();