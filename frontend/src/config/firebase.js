/**
 * Firebase Client SDK configuration for frontend.
 */
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDFbdBs7xGqgMsd--EuWHRz2EyXKf-tlqo",
  authDomain: "final-year-project-1a22b.firebaseapp.com",
  projectId: "final-year-project-1a22b",
  storageBucket: "final-year-project-1a22b.firebasestorage.app",
  messagingSenderId: "413473230007",
  appId: "1:413473230007:web:11008bc8d5adc8166c5132",
  measurementId: "G-LKEYWGDSMM"
};

let app = null;
let db = null;
let auth = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  console.log('✓ Firebase Web App initialized for project: final-year-project-1a22b');
} catch (err) {
  console.warn('Firebase frontend initialization warning:', err.message);
}

export { app, db, auth, firebaseConfig };

