import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthChange,
  getIdToken,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  logOut,
  handleRedirectResult,
} from '../services/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Handle redirect result first (for Google sign-in)
    handleRedirectResult().catch((err) => {
      console.error('[Auth] Redirect error:', err);
      setError(err.message);
    });

    // Listen for auth state changes
    const unsubscribe = onAuthChange((firebaseUser) => {
      if (firebaseUser) {
        console.log('[Auth] User signed in:', firebaseUser.uid, firebaseUser.email);
        setUser(firebaseUser);
      } else {
        console.log('[Auth] No user signed in');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Get fresh ID token for API calls
  const getToken = async () => {
    try {
      return await getIdToken();
    } catch (err) {
      console.error('[Auth] Get token error:', err);
      return null;
    }
  };

  // Sign in with Google
  const loginWithGoogle = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Sign in with email/password
  const loginWithEmail = async (email, password) => {
    setError(null);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Sign up with email/password
  const registerWithEmail = async (email, password) => {
    setError(null);
    try {
      await signUpWithEmail(email, password);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Sign out
  const logout = async () => {
    try {
      await logOut();
    } catch (err) {
      setError(err.message);
    }
  };

  const value = {
    user,
    userId: user?.uid,
    email: user?.email,
    isAnonymous: user?.isAnonymous,
    loading,
    error,
    getToken,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
