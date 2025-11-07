// services/parseurService.ts
export class ParseurService {
  private apiKey: string;
  private mailboxId: string;

  constructor() {
    this.apiKey = process.env.PARSEUR_API_KEY!;
    this.mailboxId = process.env.PARSEUR_MAILBOX_ID!;
  }

  async analyzeWithParseur(fileUrl: string, filename: string): Promise<any> {
    try {
      console.log(`🔍 Envoi à Parseur: ${filename}`);
      
      const response = await fetch('https://api.parseur.com/document/upload/url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${this.apiKey}`
        },
        body: JSON.stringify({
          url: fileUrl,
          mailbox: this.mailboxId,
          filename: filename,
          wait: true // Attendre l'analyse complète
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Parseur API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ Parseur analyse terminée: ${result.id}`);
      
      return result;
      
    } catch (error) {
      console.error('❌ Erreur Parseur:', error);
      throw error;
    }
  }

  async getParseurResult(documentId: string): Promise<any> {
    const response = await fetch(`https://api.parseur.com/document/${documentId}`, {
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`Parseur fetch error: ${response.status}`);
    }

    return await response.json();
  }
}