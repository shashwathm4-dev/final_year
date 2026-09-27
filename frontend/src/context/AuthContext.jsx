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

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(true);

  // Listen for auth state changes
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch role from Firestore users/{uid}
        try {
          if (db) {
            const userDocRef = doc(db, 'users', firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              const data = userDoc.data();
              setRole(data.role || 'patient');
              setFullName(data.fullName || firebaseUser.displayName || '');
            } else {
              setRole('patient');
              setFullName(firebaseUser.displayName || '');
            }
          } else {
            setRole('patient');
          }
        } catch (err) {
          console.warn('Failed to fetch user role:', err.message);
          setRole('patient');
        }
      } else {
        setUser(null);
        setRole(null);
        setFullName('');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email, password) => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const signUp = useCallback(async (email, password, selectedRole, name) => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // Create users/{uid} document in Firestore
    if (db) {
      try {
        const userDocRef = doc(db, 'users', cred.user.uid);
        await setDoc(userDocRef, {
          email: cred.user.email,
          role: selectedRole || 'patient',
          fullName: name || '',
          doctorId: null,
          createdAt: new Date().toISOString(),
        });
        setRole(selectedRole || 'patient');
        setFullName(name || '');
      } catch (err) {
        console.error('Failed to create user document:', err);
      }
    }

    return cred.user;
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    setUser(null);
    setRole(null);
    setFullName('');
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
