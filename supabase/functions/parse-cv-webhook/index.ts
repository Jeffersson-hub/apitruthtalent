// functions/parse-cv-webhook/index.ts - VERSION CORRIGÉE FINALE
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  console.log('🚀 Webhook appelé depuis Parseur');
  
  // Répondre immédiatement aux OPTIONS
  if (req.method === 'OPTIONS') {
    console.log('🔄 Réponse OPTIONS');
    return new Response('ok', { 
      status: 200, 
      headers: corsHeaders 
    });
  }

  // SEULEMENT ACCEPTER POST
  if (req.method !== 'POST') {
    console.log(`❌ Méthode non autorisée: ${req.method}`);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 1. VÉRIFIER LE CONTENT-TYPE
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.log(`❌ Content-Type invalide: ${contentType}`);
      return new Response(JSON.stringify({ error: 'Invalid content type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. LIRE LE BODY SANS VÉRIFICATION D'AUTH
    console.log('📥 Lecture du body...');
    const webhookData = await req.json();
    
    // DEBUG: Afficher les premières données reçues
    console.log('📨 Données brutes reçues de Parseur:');
    console.log('ID:', webhookData.id);
    console.log('File name:', webhookData.file_name);
    console.log('Parsed:', webhookData.parsed ? 'Oui' : 'Non');

    // 3. VÉRIFIER LES DONNÉES MINIMALES
    if (!webhookData.parsed) {
      console.log('⚠️ Données parsées manquantes');
      // Pas d'erreur, on continue avec ce qu'on a
    }

    // 4. MAPPER LES DONNÉES
    const candidatData = mapParseurToCandidat(webhookData);
    
    console.log('📊 Données mappées pour insertion:');
    console.log('- Nom:', candidatData.nom);
    console.log('- Prénom:', candidatData.prenom);
    console.log('- Email:', candidatData.email);
    console.log('- Expériences:', candidatData.experiences?.length || 0);

    // 5. INSÉRER DANS LA BASE
    console.log('💾 Insertion dans la base de données...');
    
    const { data: insertedData, error: insertError } = await supabase
      .from('candidats')
      .insert(candidatData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erreur insertion:', insertError);
      
      // Gestion des doublons (email déjà existant)
      if (insertError.code === '23505') {
        console.log('⚠️ Candidat déjà existant (doublon), mise à jour...');
        
        const { data: updatedData, error: updateError } = await supabase
          .from('candidats')
          .update(candidatData)
          .eq('email', candidatData.email)
          .select()
          .single();
          
        if (updateError) {
          console.error('❌ Erreur mise à jour:', updateError);
          throw updateError;
        }
        
        console.log('✅ Candidat mis à jour avec ID:', updatedData.id);
        return new Response(JSON.stringify({ 
          success: true, 
          action: 'updated',
          candidat: updatedData 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw insertError;
    }

    console.log('✅ Candidat créé avec ID:', insertedData.id);

    return new Response(JSON.stringify({ 
      success: true, 
      action: 'created',
      candidat: insertedData 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erreur dans le webhook:', error);
    
    // Envoyer une réponse d'erreur détaillée
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Gardez TOUTES les fonctions auxiliaires (mapParseurToCandidat, extractCompetences, etc.)
// EXACTEMENT comme dans votre code original