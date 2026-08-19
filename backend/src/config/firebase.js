/**
 * Firebase initialization service.
 * Supports Firebase Admin SDK (for service account access) and
 * local in-memory fallback when cloud database is disabled/unconfigured.
 */
const admin = require('firebase-admin');
require('dotenv').config();

let db = null;
let storage = null;
let isInitialized = false;
let isClientSdk = false;

function initFirebase() {
  if (isInitialized) return;

  const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const enableWebFirestore = process.env.ENABLE_WEB_FIRESTORE === 'true';

  // 1. Try Admin SDK first if service account credentials exist
  if (googleAppCreds || serviceAccountPath || (projectId && clientEmail && privateKey)) {
    try {
      let credential;
      if (googleAppCreds) {
        credential = admin.credential.applicationDefault();
        console.log('✓  Initializing Firebase Admin SDK via GOOGLE_APPLICATION_CREDENTIALS');
      } else if (serviceAccountPath) {
        const path = require('path');
        const resolvedPath = path.isAbsolute(serviceAccountPath)
          ? serviceAccountPath
          : path.join(process.cwd(), serviceAccountPath);
        const serviceAccount = require(resolvedPath);
        credential = admin.credential.cert(serviceAccount);
        console.log(`✓  Initializing Firebase Admin SDK via Service Account File: ${resolvedPath}`);
      } else {
        credential = admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        });
        console.log('✓  Initializing Firebase Admin SDK via environment variables');
      }

      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : undefined);
      admin.initializeApp({
        credential,
        ...(bucketName ? { storageBucket: bucketName } : {}),
      });

      db = admin.firestore();
      storage = admin.storage();
      isInitialized = true;
      isClientSdk = false;
      console.log('✓  Firebase Admin SDK initialized successfully');
      return;
    } catch (err) {
      console.error('✗  Firebase Admin SDK initialization failed:', err.message);
    }
  }

  // 2. Optional: Web Client SDK if explicitly enabled via ENABLE_WEB_FIRESTORE=true
  if (enableWebFirestore && process.env.FIREBASE_API_KEY && projectId) {
    try {
      const { initializeApp: initializeClientApp } = require('firebase/app');
      const { getFirestore: getClientFirestore } = require('firebase/firestore');

      const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID,
      };

      const clientApp = initializeClientApp(firebaseConfig);
      db = getClientFirestore(clientApp);
      isInitialized = true;
      isClientSdk = true;
      console.log(`✓  Initialized Firebase Web SDK for project: ${projectId}`);
      return;
    } catch (err) {
      console.error('✗  Firebase Web SDK initialization failed:', err.message);
    }
  }

  console.log('ℹ  Running in Local In-Memory mode for session logging (No remote database required).');
  isInitialized = true;
}

initFirebase();

module.exports = { db, storage, admin, isClientSdk };
