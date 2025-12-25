import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

let initialized = false;

/**
 * Initialize Firebase Admin SDK
 */
export function initializeFirebase() {
  if (initialized) {
    return admin;
  }

  const serviceAccountPath = join(__dirname, '../serviceAccountKey.json');

  if (existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    console.log(`[Firebase] Initialized with project: ${serviceAccount.project_id}`);
  } else {
    // Fallback to default credentials
    admin.initializeApp();
    console.log('[Firebase] Initialized with default credentials');
  }

  initialized = true;
  return admin;
}

const APP_ID = 'soulmate-ai-mvp';

/**
 * Verify Firebase ID token
 */
export async function verifyIdToken(idToken) {
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return decoded;
  } catch (error) {
    console.error('[Firebase] Token verification failed:', error.message);
    return null;
  }
}

/**
 * Get or create user in Firestore
 */
export async function getOrCreateUser(userId, userData = {}) {
  const db = admin.firestore();
  const userRef = db
    .collection('artifacts')
    .doc(APP_ID)
    .collection('users')
    .doc(userId);

  const userDoc = await userRef.get();

  if (userDoc.exists) {
    return { ...userDoc.data(), isNew: false };
  }

  // Create new user
  const newUser = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    isAnonymous: userData.isAnonymous || false,
    email: userData.email || null,
  };

  await userRef.set(newUser);
  console.log(`[Firebase] Created new user: ${userId}`);

  return { ...newUser, isNew: true };
}

export default admin;
