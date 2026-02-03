// utils/nerClient.ts - VERSION CORRIGÉE TypeScript
export async function callNerService(text: string): Promise<any> {
  const url = process.env.NER_SERVICE_URL || "https://apitruthtalent-98rc.onrender.com/parse-text";
  const apiKey = process.env.NER_API_KEY || "";
  
  const headers: Record<string, string> = { 
    "Content-Type": "application/json" 
  };
  
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.warn(`NER service error ${res.status}: ${txt}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    return await res.json();
    
  } catch (error: unknown) {
    console.warn("NER service call failed:", error);
    
    // Gestion type-safe de l'erreur
    if (error instanceof Error) {
      return { ok: false, error: error.message };
    } else {
      return { ok: false, error: 'Unknown error occurred' };
    }
  }
}