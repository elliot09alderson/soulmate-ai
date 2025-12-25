import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';

// Firebase configuration - using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'soulmate4u-c2e63.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'soulmate4u-c2e63',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'soulmate4u-c2e63.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with Google (redirect)
 */
export async function signInWithGoogle() {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error) {
    console.error('[Firebase] Google sign-in error:', error);
    throw error;
  }
}

/**
 * Handle redirect result after Google sign-in
 */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      console.log('[Firebase] Signed in with Google:', result.user.uid);
      return result.user;
    }
    return null;
  } catch (error) {
    console.error('[Firebase] Redirect result error:', error);
    throw error;
  }
}

/**
 * Sign in with Email/Password
 */
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    console.log('[Firebase] Signed in with email:', result.user.uid);
    return result.user;
  } catch (error) {
    console.error('[Firebase] Email sign-in error:', error);
    throw error;
  }
}

/**
 * Sign up with Email/Password
 */
export async function signUpWithEmail(email, password) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    console.log('[Firebase] Created account:', result.user.uid);
    return result.user;
  } catch (error) {
    console.error('[Firebase] Sign-up error:', error);
    throw error;
  }
}

/**
 * Sign out
 */
export async function logOut() {
  try {
    await signOut(auth);
    console.log('[Firebase] Signed out');
  } catch (error) {
    console.error('[Firebase] Sign-out error:', error);
    throw error;
  }
}

/**
 * Sign in anonymously - creates a persistent user ID
 */
export async function signInAnon() {
  try {
    const userCredential = await signInAnonymously(auth);
    console.log('[Firebase] Signed in anonymously:', userCredential.user.uid);
    return userCredential.user;
  } catch (error) {
    console.error('[Firebase] Anonymous sign-in error:', error);
    throw error;
  }
}

/**
 * Get the current user's ID token for API calls
 */
export async function getIdToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No user signed in');
  }
  return await user.getIdToken();
}

/**
 * Get the current user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Listen for auth state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export { auth, app };
