import { createClient } from "@supabase/supabase-js";

// Version qui ne crash pas au build
let supabaseInstance: any = null;

export const getSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Si en mode build, retourner un mock
  if (process.env.NEXT_PHASE === 'phase-production-build' || !supabaseUrl || !supabaseServiceKey) {
    console.warn('⚠️ Mode build ou variables manquantes - retour mock');
    return {
      from: () => ({
        select: () => Promise.resolve({ data: null, error: null }),
        update: () => Promise.resolve({ data: null, error: null }),
        insert: () => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
        eq: () => ({})
      })
    };
  }
  
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });
  }
  
  return supabaseInstance;
};

export const supabase = getSupabase();