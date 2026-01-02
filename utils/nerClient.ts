import fetch from "node-fetch";

export async function callNerService(text: string): Promise<any> {
  const url = process.env.NER_SERVICE_URL || "https://apitruthtalent-98rc.onrender.com/parse-text";
  const apiKey = process.env.NER_API_KEY || "";
  const headers: any = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ text })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`NER service error ${res.status}: ${txt}`);
  }
  return await res.json();
}