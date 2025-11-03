// utils/fetchToBuffer.ts
export async function fetchToBuffer(url: string): Promise<{ buffer: Buffer; filename: string }> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Extraire le nom de fichier de l'URL
    const filename = url.split('/').pop() || 'unknown';
    
    return { buffer, filename };
  } catch (error) {
    console.error('Erreur fetchToBuffer:', error);
    throw error;
  }
}