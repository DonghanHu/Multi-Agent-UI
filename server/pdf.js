// server/pdf.js
import pdf from 'pdf-parse/lib/pdf-parse.js'; // <-- important

export async function pdfBufferToText(buffer) {
  const { text } = await pdf(buffer);
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function chunkText(str, maxLen = 12000) {
  const chunks = [];
  for (let i = 0; i < str.length; i += maxLen) {
    chunks.push(str.slice(i, i + maxLen));
  }
  return chunks;
}
