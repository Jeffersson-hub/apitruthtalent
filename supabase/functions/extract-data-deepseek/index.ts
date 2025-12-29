// functions/extract-data-deepseek/index.js
import { createClient } from 'npm:@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { candidat_id, cv_url, file_name } = await req.json()
    
    if (!candidat_id || !cv_url) {
      throw new Error('candidat_id et cv_url sont requis')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') || 'https://cpdokjsyxmohubgvxift.supabase.co',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // 1. Récupérer le fichier CV depuis Storage
    const cvText = await getCVText(cv_url, supabaseClient)
    
    // 2. Extraire les données avec DeepSeek
    const extraction = await extractCVDataDeepSeek(cvText)
    
    // 3. Mettre à jour le candidat
    const { error } = await supabaseClient
      .from('candidats')
      .update({
        raw_text: cvText,
        niveau: extraction.niveau,
        metiers: extraction.metiers,
        competences: extraction.competences,
        annees_experience: extraction.annees_experience,
        postes: extraction.postes,
        entreprise: extraction.entreprise,
        formations: extraction.formations,
        experiences: extraction.experiences,
        langues: extraction.langues,
        profil: extraction.profil,
        updated_at: new Date().toISOString(),
        cv_filename: file_name || null
      })
      .eq('id', candidat_id)

    if (error) throw error

    return new Response(
      JSON.stringify({ 
        success: true, 
        candidat_id,
        extraction 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erreur:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        details: error.stack 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    )
  }
})

async function getCVText(cvUrl, supabaseClient) {
  try {
    // Si c'est une URL de fichier texte directement
    if (cvUrl.endsWith('.txt')) {
      const response = await fetch(cvUrl)
      return await response.text()
    }
    
    // Pour PDF/DOCX, vous aurez besoin d'une autre méthode
    // Solution temporaire : retourner un texte minimal
    return "CV en cours d'analyse - besoin d'un parser PDF/DOCX"
    
  } catch (error) {
    console.error('Erreur lecture CV:', error)
    return ''
  }
}

async function extractCVDataDeepSeek(cvText) {
  if (!cvText || cvText.length < 50) {
    throw new Error('Texte CV trop court ou vide')
  }

  const prompt = `
  Tu es un système expert ATS français. Analyse ce CV et retourne UNIQUEMENT un JSON valide.

  IMPORTANT : Retourne uniquement le JSON, sans texte supplémentaire.

  Structure JSON requise :
  {
    "niveau": "Bac+5",
    "metiers": "Développeur Full Stack, Data Analyst",
    "competences": ["JavaScript", "React", "Python", "SQL", "Git"],
    "annees_experience": 4.5,
    "postes": "Développeur Senior, Lead Technique",
    "entreprise": "Société Actuelle",
    "formations": [
      {
        "diplome": "Master Informatique",
        "etablissement": "Université Paris-Saclay",
        "annee": "2020",
        "niveau_rncp": "Niveau 7"
      }
    ],
    "experiences": [
      {
        "poste": "Développeur",
        "entreprise": "Google",
        "date_debut": "2020-01",
        "date_fin": "2022-12",
        "duree_mois": 36
      }
    ],
    "langues": ["Anglais Courant", "Espagnol Intermédiaire"],
    "profil": "Développeur full stack avec 5 ans d'expérience..."
  }

  RÈGLES STRICTES :

  1. NIVEAU : Choisir UN SEUL parmi :
  - "Sans diplôme"
  - "Niveau collège"
  - "CAP / BEP" (Niveau 3 RNCP)
  - "Bac" (Bac général/pro/techno) (Niveau 4)
  - "Bac+2" (BTS, DUT, DEUG) (Niveau 5)
  - "Bac+3" (Licence, BUT, Bachelor) (Niveau 6)
  - "Bac+5" (Master, Diplôme d'ingénieur, MBA) (Niveau 7)
  - "Bac+8" (Doctorat) (Niveau 8)
  - "Autodidacte"
  - "Indéterminé"

  2. MÉTIERS : Max 3, format "Métier1, Métier2, Métier3"

  3. COMPÉTENCES : Array de strings, max 15 compétences principales

  4. ANNÉES_EXPÉRIENCE : Total en années décimales. Additionner TOUTES les expériences.
     Format: 3.5 pour 3 ans et 6 mois

  5. ENTREPRISE : Dernière entreprise ou entreprise principale

  6. PROFIL : 1-2 phrases résumant le profil professionnel

  Texte CV à analyser :
  ${cvText.substring(0, 4000)}
  `

  try {
    const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY')
    if (!DEEPSEEK_API_KEY) {
      throw new Error('Clé API DeepSeek manquante')
    }

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      })
    })

    if (!response.ok) {
      throw new Error(`API DeepSeek: ${response.status}`)
    }

    const data = await response.json()
    const resultText = data.choices[0].message.content
    
    // Nettoyer le JSON (au cas où DeepSeek ajoute du texte)
    const jsonMatch = resultText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Format JSON invalide reçu de DeepSeek')
    }
    
    const extraction = JSON.parse(jsonMatch[0])
    
    // Validation et formatage des données
    return {
      niveau: validateNiveau(extraction.niveau),
      metiers: extraction.metiers || '',
      competences: Array.isArray(extraction.competences) ? extraction.competences : [],
      annees_experience: parseFloat(extraction.annees_experience) || 0,
      postes: extraction.postes || '',
      entreprise: extraction.entreprise || '',
      formations: Array.isArray(extraction.formations) ? extraction.formations : [],
      experiences: Array.isArray(extraction.experiences) ? extraction.experiences : [],
      langues: Array.isArray(extraction.langues) ? extraction.langues : [],
      profil: extraction.profil || ''
    }
    
  } catch (error) {
    console.error('Erreur extraction DeepSeek:', error)
    throw error
  }
}

function validateNiveau(niveau) {
  const niveauxValides = [
    'Sans diplôme', 'Niveau collège', 'CAP / BEP', 'Bac',
    'Bac+2', 'Bac+3', 'Bac+5', 'Bac+8',
    'Autodidacte', 'Indéterminé'
  ]
  
  return niveauxValides.includes(niveau) ? niveau : 'Indéterminé'
}