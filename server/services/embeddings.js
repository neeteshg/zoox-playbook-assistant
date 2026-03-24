import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

let client = null;

function getClient() {
  if (!client && process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function generateEmbedding(text) {
  const openai = getClient();
  if (!openai) return null;

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000), // Limit input length
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('Embedding generation failed:', err.message);
    return null;
  }
}

export async function generateEmbeddings(texts) {
  const openai = getClient();
  if (!openai) return texts.map(() => null);

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts.map(t => t.substring(0, 8000)),
    });
    return response.data.map(d => d.embedding);
  } catch (err) {
    console.error('Batch embedding generation failed:', err.message);
    return texts.map(() => null);
  }
}

export function hasApiKey() {
  return !!process.env.OPENAI_API_KEY;
}
