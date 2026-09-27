/**
 * API service — frontend wrapper for backend calls.
 */
import axios from 'axios';

import { auth } from '../config/firebase';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30s — Gemini can take a while on free tier
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Firebase Auth ID token to every outgoing request
api.interceptors.request.use(async (config) => {
  try {
    if (auth && auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('Failed to retrieve Firebase ID token:', err.message);
  }
  return config;
});

/**
 * User & Role API calls
 */
export async function getMyProfile() {
  const res = await api.get('/users/me');
  return res.data;
}

export async function syncUserProfile(profileData) {
  const res = await api.post('/users/profile', profileData);
  return res.data;
}

export async function getDoctorPatients() {
  const res = await api.get('/users/patients');
  return res.data;
}

export async function addDoctorPatient(email) {
  const res = await api.post('/users/add-patient', { email });
  return res.data;
}

/**
 * Exercise endpoints
 */
export async function getExercises() {
  try {
    const res = await api.get('/exercises');
    return res.data.exercises || [];
  } catch (err) {
    console.warn('Failed to fetch exercises from backend:', err.message);
    return [];
  }
}

export async function getExercise(exerciseId) {
  const res = await api.get(`/exercises/${exerciseId}`);
  return res.data;
}

export async function createCustomExercise(exerciseData) {
  const res = await api.post('/exercises', exerciseData);
  return res.data;
}

/**
 * Assignment endpoints
 */
export async function getAssignments() {
  try {
    const res = await api.get('/assignments');
    return res.data.assignments || [];
  } catch (err) {
    console.warn('Failed to fetch assignments:', err.message);
    return [];
  }
}

export async function assignExerciseToPatient(data) {
  const res = await api.post('/assignments', data);
  return res.data;
}

/**
 * Session history endpoints
 */
export async function getMySessions() {
  try {
    const res = await api.get('/sessions/my');
    return res.data.sessions || [];
  } catch (err) {
    console.warn('Failed to fetch my sessions:', err.message);
    return [];
  }
}

export async function getPatientSessions(patientId) {
  try {
    const res = await api.get(`/sessions/patient/${patientId}`);
    return res.data.sessions || [];
  } catch (err) {
    console.warn('Failed to fetch patient sessions:', err.message);
    return [];
  }
}


/**
 * Start a new exercise session.
 * @param {string} exerciseId
 * @returns {Promise<{ sessionId: string }>}
 */
export async function startSession(exerciseId) {
  try {
    const res = await api.post('/session/start', { exerciseId });
    return res.data;
  } catch (err) {
    console.warn('Failed to start session on backend — running in offline mode', err.message);
    // Generate a local session ID so the app still works without backend
    return { sessionId: `local_${Date.now()}` };
  }
}

/**
 * Log a completed rep.
 * @param {Object} repData - { sessionId, exerciseId, repNumber, timestamp, angles, verdictSource, correct, issue }
 */
export async function logRep(repData) {
  try {
    await api.post('/session/log-rep', repData);
  } catch (err) {
    console.warn('Failed to log rep — data not persisted:', err.message);
  }
}

/**
 * Send a rep's peak frame to the backend for Gemini VLM verification.
 * @param {{ patientFrame: string, referenceFrame: string, exerciseId: string, sessionId?: string }} payload
 * @returns {Promise<{ correct: boolean|null, issue: string, severity: string, source: string }>}
 */
export async function verifyRep(payload) {
  try {
    const res = await api.post('/verify-rep', payload);
    return res.data;
  } catch (err) {
    console.warn('VLM verification failed:', err.message);
    return {
      correct: null,
      issue: 'AI verification unavailable — please check your connection',
      severity: 'low',
      source: 'error',
    };
  }
}

/**
 * Retrieve session history.
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function getSession(sessionId) {
  try {
    const res = await api.get(`/session/${sessionId}`);
    return res.data;
  } catch (err) {
    console.warn('Failed to fetch session:', err.message);
    return null;
  }
}

/**
 * Health check.
 */
export async function healthCheck() {
  try {
    const res = await api.get('/health');
    return res.data;
  } catch {
    return { status: 'unreachable' };
  }
}

