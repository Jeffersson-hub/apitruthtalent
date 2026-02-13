import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import natural from 'natural';

const { WordTokenizer } = natural;
const tokenizer = new WordTokenizer();

export async function analyzeResume(fileBuffer, filePath, jobDescription) {
  let extractedText = "";
  if (filePath.endsWith('.pdf')) {
    const pdfData = await pdfParse(Buffer.from(fileBuffer));
    extractedText = pdfData.text;
  } else if (filePath.endsWith('.docx')) {
    const docxData = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
    extractedText = docxData.value;
  } else {
    throw new Error("Format non supporté. Utilisez PDF ou DOCX.");
  }

  const tokens = tokenizer.tokenize(extractedText.toLowerCase());
  const skills = [...new Set(tokens.filter(token => token.length > 3))].slice(0, 20);

  return {
    success: true,
    skills,
    textPreview: extractedText.substring(0, 500),
    atsScore: 85 // Exemple
  };
}
