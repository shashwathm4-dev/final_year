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
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { syncUserProfile } from '../services/api';

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

        // Fetch role from Firestore users/{uid} with quick timeout
        try {
          if (db) {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            // 2.5s timeout for Firestore getDoc so page doesn't hang if Firestore is unconfigured or slow
            const docPromise = getDoc(userDocRef);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Firestore timeout')), 2500)
            );
            const userDoc = await Promise.race([docPromise, timeoutPromise]);
            
            if (userDoc && userDoc.exists()) {
              const data = userDoc.data();
              const userRole = data.role || localStorage.getItem('user_role') || 'patient';
              const name = data.fullName || firebaseUser.displayName || '';
              setRole(userRole);
              setFullName(name);
              localStorage.setItem('user_role', userRole);
              localStorage.setItem('user_name', name);
            } else {
              const fallbackRole = localStorage.getItem('user_role') || 'patient';
              setRole(fallbackRole);
              setFullName(firebaseUser.displayName || '');
            }
          } else {
            const fallbackRole = localStorage.getItem('user_role') || 'patient';
            setRole(fallbackRole);
          }
        } catch (err) {
          console.warn('Failed to fetch user role (using cached/fallback):', err.message);
          const fallbackRole = localStorage.getItem('user_role') || 'patient';
          setRole(fallbackRole);
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
    if (expectedRole) {
      setRole(expectedRole);
      localStorage.setItem('user_role', expectedRole);
    }
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const effectiveRole = expectedRole || localStorage.getItem('user_role') || 'patient';
    syncUserProfile({ role: effectiveRole }).catch(() => {});
    return cred.user;
  }, []);

  const signUp = useCallback(async (email, password, selectedRole, name) => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    const roleToSet = selectedRole || 'patient';
    setRole(roleToSet);
    setFullName(name || '');
    localStorage.setItem('user_role', roleToSet);
    if (name) localStorage.setItem('user_name', name);

    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Create users/{uid} document in Firestore
    if (db) {
      try {
        const userDocRef = doc(db, 'users', cred.user.uid);
        await setDoc(userDocRef, {
          email: cred.user.email,
          role: roleToSet,
          fullName: name || '',
          doctorId: null,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to create user document:', err);
      }
    }

    // Also sync to backend persistent store
    syncUserProfile({ role: roleToSet, fullName: name || '' }).catch(() => {});

    return cred.user;
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!auth) return;
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
