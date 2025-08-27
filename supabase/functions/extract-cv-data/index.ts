import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import * as mammoth from 'npm:mammoth@1.4.17';
import { Buffer } from 'node:buffer';
// Configuration de l'extraction intelligente
const EXTRACTION_PATTERNS = {
  nom: [
    /(?:nom\s*[:\-]?\s*)([A-ZÀ-Ÿ][a-zà-ÿ-]+)/i,
    /(?:last\s*name\s*[:\-]?\s*)([A-ZÀ-Ÿ][a-zà-ÿ-]+)/i
  ],
  prenom: [
    /(?:prénom\s*[:\-]?\s*)([A-ZÀ-Ÿ][a-zà-ÿ-]+)/i,
    /(?:first\s*name\s*[:\-]?\s*)([A-ZÀ-Ÿ][a-zà-ÿ-]+)/i
  ],
  email: [
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  ],
  telephone: [
    /(?:\+?33|0)[1-9](?:[\s.-]?\d{2}){4}/,
    /\+?1?\d{10}/
  ],
  adresse: [
    /(?:adresse\s*[:\-]?\s*)(.{20,100})/i,
    /(?:address\s*[:\-]?\s*)(.{20,100})/i
  ],
  metiers: [
    /(?:poste|métier|profession)\s*[:\-]?\s*([^\n]+)/i
  ],
  competences: [
    /(?:compétences|skills)[:\-]?\s*([^\n]+)/i
  ]
};
class CVExtractor {
  async extractData(fileContent, fileType) {
    console.log(`Extraction pour type de fichier: ${fileType}`);
    let text = '';
    // Extraction par type de fichier
    switch(fileType){
      case 'application/pdf':
        text = await this.extractPDFText(fileContent);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        text = await this.extractWordText(fileContent);
        break;
      default:
        console.warn(`Format non standard: ${fileType}`);
        text = await this.extractGenericText(fileContent);
    }
    console.log('Texte extrait (premiers 500 caractères):', text.slice(0, 500));
    return this.parseExtractedText(text);
  }
  async extractPDFText(pdfBuffer) {
    try {
      const buf = Buffer.from(new Uint8Array(ab));
      const data = await pdf(buf);
      return data.text || '';
    } catch (e) {
      console.error('Erreur extraction PDF:', e);
      return '';
    }
  }
  async extractWordText(docxBuffer) {
    try {
      const result = await mammoth.extractRawText({
        buffer: docxBuffer
      });
      return result.value;
    } catch (error) {
      console.error('Erreur extraction DOCX:', error);
      return '';
    }
  }
  async extractGenericText(buffer) {
    try {
      const decoder = new TextDecoder('utf-8');
      return decoder.decode(buffer);
    } catch (error) {
      console.error('Erreur extraction générique:', error);
      return '';
    }
  }
  parseExtractedText(text) {
    const result = {
      raw_text: text
    };
    // Extraction par regex
    Object.entries(EXTRACTION_PATTERNS).forEach(([key, patterns])=>{
      for (const pattern of patterns){
        const match = text.match(pattern);
        if (match) {
          result[key] = match[1].trim();
          console.log(`Trouvé ${key}:`, result[key]);
          break;
        }
      }
    });
    return result;
  }
}
// Configuration Supabase
Deno.serve(async (req)=>{
  console.log('🚀 Démarrage de l\'extraction des CV');
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    // Lister tous les CV
    const { data: files, error: listError } = await supabase.storage.from('truthtalent').list('cvs', {
      limit: 100,
      offset: 0,
      sortBy: {
        column: 'name',
        order: 'asc'
      }
    });
    if (listError) {
      console.error('Erreur de listing:', listError);
      throw listError;
    }
    console.log(`📂 Nombre de fichiers trouvés: ${files.length}`);
    const extractor = new CVExtractor();
    const processedCVs = [];
    for (const file of files){
      console.log(`🔍 Traitement du fichier: ${file.name}`);
      // Télécharger le fichier
      const { data: fileContent, error: downloadError } = await supabase.storage.from('truthtalent').download(`cvs/${file.name}`);
      if (downloadError) {
        console.error(`❌ Erreur de téléchargement: ${file.name}`, downloadError);
        continue;
      }
      try {
        // Extraction des données
        const extractedData = await extractor.extractData(await fileContent.arrayBuffer(), fileContent.type);
        // Si des données ont été extraites
        if (Object.keys(extractedData).length > 0) {
          // Insertion dans la base
          const { data: insertData, error: insertError } = await supabase.from('candidats').upsert({
            // Mapping exact des colonnes
            nom: extractedData.nom ?? null,
            prenom: extractedData.prenom ?? null,
            email: extractedData.email ?? null,
            telephone: extractedData.telephone ?? null,
            adresse: extractedData.adresse ?? null,
            // Assure-toi que ce sont bien des tableaux JS (pas des strings)
            competences: Array.isArray(extractedData.competences) ? extractedData.competences : [],
            experiences: Array.isArray(extractedData.experiences) ? extractedData.experiences : [],
            formations: Array.isArray(extractedData.formations) ? extractedData.formations : [],
            langues: Array.isArray(extractedData.langues) ? extractedData.langues : [],
            // optionnels si colonnes créées :
            profil: extractedData.profil ?? null,
            poste: extractedData.poste ?? null,
            entreprise: extractedData.entreprise ?? null,
            raw_text: extractedData.raw_text ?? null,
            fichier: file.name ?? null
          }).select();
          if (insertError) {
            console.error(`❌ Erreur insertion: ${file.name}`, insertError);
          } else {
            console.log(`✅ CV traité avec succès: ${file.name}`);
            processedCVs.push(extractedData);
          }
        } else {
          console.warn(`⚠️ Aucune donnée extraite pour: ${file.name}`);
        }
      } catch (extractError) {
        console.error(`❌ Erreur extraction: ${file.name}`, extractError);
      }
    }
    return new Response(JSON.stringify({
      message: `Traitement terminé`,
      cvTraites: processedCVs.length,
      details: processedCVs
    }), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Erreur globale:', error);
    return new Response(JSON.stringify({
      error: 'Échec du traitement',
      details: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
function pdf(buf) {
  throw new Error('Function not implemented.');
}
