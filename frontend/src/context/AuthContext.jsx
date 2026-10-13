/**
 * AuthContext — Firebase Auth state management.
 * Exposes { user, role, loading, signIn, signUp, signOut } via React Context.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { syncUserProfile, flushOfflineQueue, getMyProfile } from '../services/api';
import { clearOfflineData } from '../services/offlineQueue';
import { auth } from '../config/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialize from cache if available for instant dashboard access
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('auth_user_cache');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [role, setRole] = useState(() => localStorage.getItem('user_role') || null);
  const [fullName, setFullName] = useState(() => localStorage.getItem('user_name') || '');
  const [loading, setLoading] = useState(!auth ? false : !user);

  // Listen for auth state changes
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          localStorage.setItem('auth_user_cache', JSON.stringify({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          }));
        } catch {
          // ignore localStorage error
        }

        // Role comes from the backend profile (server is the source of truth)
        try {
          const profile = await Promise.race([
            getMyProfile(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Profile timeout')), 4000)),
          ]);
          const userRole = profile.role === 'doctor' ? 'doctor' : 'patient';
          const name = profile.fullName || firebaseUser.displayName || '';
          setRole(userRole);
          setFullName(name);
          localStorage.setItem('user_role', userRole);   // display cache only, never sent to the server
          localStorage.setItem('user_name', name);
        } catch (err) {
          console.warn('Could not load profile (using cached role for display only):', err.message);
          setRole(localStorage.getItem('user_role') || 'patient');
        }
      } else {
        setUser(null);
        setRole(null);
        setFullName('');
        localStorage.removeItem('auth_user_cache');
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_name');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password, expectedRole = null) => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const targetRole = expectedRole || 'patient';
    setRole(targetRole);
    localStorage.setItem('user_role', targetRole);

    try {
      // Sync the requested role to the backend profile
      const profile = await syncUserProfile({ role: targetRole });
      if (profile && profile.role) {
        setRole(profile.role);
        localStorage.setItem('user_role', profile.role);
        if (profile.fullName) setFullName(profile.fullName);
      }
    } catch (err) {
      console.warn('Profile sync on sign-in warning:', err.message);
    }

    return cred.user;
  }, []);

  const signUp = useCallback(async (email, password, selectedRole, name) => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // Backend creates users/{uid}; it decides the final role (see ALLOW_DOCTOR_SELF_SIGNUP)
    const profile = await syncUserProfile({ role: selectedRole || 'patient', fullName: name || '' });
    setRole(profile.role);
    setFullName(profile.fullName || name || '');
    localStorage.setItem('user_role', profile.role);
    if (name) localStorage.setItem('user_name', name);
    return cred.user;
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!auth) return;
    // Upload anything still queued, then wipe cached health data from this device
    await flushOfflineQueue().catch(() => {});
    clearOfflineData();
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
    setFullName('');
    localStorage.removeItem('auth_user_cache');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_name');
  }, []);

  const value = {
    user,
    role,
    fullName,
    loading,
    signIn,
    signUp,
    signOut: handleSignOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
