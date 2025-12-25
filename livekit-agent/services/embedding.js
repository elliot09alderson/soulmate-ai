import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

// Vertex AI Configuration
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'soulmate4u-c2e63';
const LOCATION = process.env.VERTEX_AI_LOCATION || 'asia-south1';
const MODEL_ID = 'text-embedding-004';

console.log(`[Embedding] Initialized for project: ${PROJECT_ID}, location: ${LOCATION}`);

let authClient = null;

// Initialize Google Auth with service account
async function getAuthClient() {
  if (!authClient) {
    // Find service account file
    const possiblePaths = [
      join(__dirname, '../serviceAccountKey.json'),
      join(__dirname, '../firebase-service-account.json'),
    ];

    let keyFile = null;
    for (const p of possiblePaths) {
      if (existsSync(p)) {
        keyFile = p;
        break;
      }
    }

    if (keyFile) {
      const auth = new GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      authClient = await auth.getClient();
      console.log(`[Embedding] Using service account: ${keyFile}`);
    } else {
      // Fallback to default credentials
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      authClient = await auth.getClient();
      console.log('[Embedding] Using default credentials');
    }
  }
  return authClient;
}

/**
 * Generate embeddings using Vertex AI text-embedding-004
 * @param {string|string[]} texts - Text or array of texts to embed
 * @returns {Promise<number[][]>} Array of embedding vectors (768 dimensions each)
 */
export async function generateEmbeddings(texts) {
  const textArray = Array.isArray(texts) ? texts : [texts];

  if (textArray.length === 0) {
    return [];
  }

  console.log(`[Embedding] Generating embeddings for ${textArray.length} text(s)...`);
  const startTime = Date.now();

  try {
    const client = await getAuthClient();
    const accessToken = await client.getAccessToken();

    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}:predict`;

    const response = await axios.post(
      endpoint,
      {
        instances: textArray.map((text) => ({
          content: text,
          task_type: 'RETRIEVAL_DOCUMENT',
        })),
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const embeddings = response.data.predictions.map((p) => p.embeddings.values);

    console.log(`[Embedding] Generated ${embeddings.length} embeddings in ${Date.now() - startTime}ms`);

    return embeddings;
  } catch (error) {
    console.error('[Embedding] Error:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Generate embedding for a single text (convenience function)
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector (768 dimensions)
 */
export async function generateEmbedding(text) {
  const embeddings = await generateEmbeddings([text]);
  return embeddings[0];
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Similarity score (0-1)
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
