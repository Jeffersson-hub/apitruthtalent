// utils/deepseek.ts - Client DeepSeek GRATUIT
export class DeepSeekClient {
  private apiKey: string;
  private baseURL = 'https://api.deepseek.com';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY || '';
  }

  async extractCVFromText(cvText: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `Tu es un expert en analyse de CV français. Extrait toutes les informations du CV suivant et retourne UNIQUEMENT un JSON valide avec cette structure exacte :

{
  "personnel": {
    "nom": "string",
    "prenom": "string", 
    "email": "string",
    "telephone": "string",
    "adresse": "string",
    "linkedin": "string"
  },
  "professionnel": {
    "poste_actuel": "string",
    "entreprise_actuelle": "string",
    "niveau": "string (Junior/Intermédiaire/Senior/Expert)",
    "annees_experience": number
  },
  "competences": {
    "techniques": ["string"],
    "soft": ["string"],
    "outils": ["string"]
  },
  "experiences": [
    {
      "entreprise": "string",
      "poste": "string",
      "date_debut": "string (YYYY-MM)",
      "date_fin": "string (YYYY-MM ou 'présent')",
      "description": "string",
      "type": "string (CDI/CDD/Freelance/Stage)"
    }
  ],
  "formations": [
    {
      "etablissement": "string", 
      "diplome": "string",
      "date_obtention": "string (YYYY)",
      "domaine": "string"
    }
  ],
  "langues": [
    {
      "langue": "string",
      "niveau": "string (Débutant/Intermédiaire/Courant/Bilingue/Natif)"
    }
  ],
  "certifications": ["string"]
}

IMPORTANT : 
1. Retourne UNIQUEMENT le JSON, pas de texte avant ou après
2. Pour les dates, utilise 'présent' si encore en poste
3. Nettoie les données (pas de caractères spéciaux inutiles)
4. Si une info n'est pas trouvée, laisse null ou tableau vide`
            },
            {
              role: 'user',
              content: cvText.substring(0, 15000) // Limite de tokens
            }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const data = await response.json();
      const jsonContent = data.choices[0].message.content;
      
      // Parse et valide le JSON
      const parsed = JSON.parse(jsonContent);
      return this.validateAndCleanData(parsed);
      
    } catch (error) {
      console.error('DeepSeek extraction error:', error);
      throw error;
    }
  }

  private validateAndCleanData(data: any): any {
    // Validation et nettoyage de base
    const cleaned = { ...data };
    
    // S'assurer que tous les champs existent
    cleaned.personnel = cleaned.personnel || {};
    cleaned.professionnel = cleaned.professionnel || {};
    cleaned.competences = cleaned.competences || { techniques: [], soft: [], outils: [] };
    cleaned.experiences = cleaned.experiences || [];
    cleaned.formations = cleaned.formations || [];
    cleaned.langues = cleaned.langues || [];
    cleaned.certifications = cleaned.certifications || [];
    
    // Nettoyer les chaînes
    const cleanString = (str: string | null) => 
      str ? str.trim().replace(/\s+/g, ' ').replace(/[^\w\sàâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ.,@\-]/g, '') : null;
    
    if (cleaned.personnel.nom) cleaned.personnel.nom = cleanString(cleaned.personnel.nom);
    if (cleaned.personnel.prenom) cleaned.personnel.prenom = cleanString(cleaned.personnel.prenom);
    if (cleaned.personnel.email) cleaned.personnel.email = cleanString(cleaned.personnel.email);
    
    return cleaned;
  }
}

// Instance globale
export const deepseek = new DeepSeekClient();