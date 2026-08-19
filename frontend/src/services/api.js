/**
 * API service — frontend wrapper for backend calls.
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30s — Gemini can take a while on free tier
  headers: {
    'Content-Type': 'application/json',
  },
});

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
 * @param {{ patientFrame: string, referenceFrame: string, exerciseId: string }} payload
 * @returns {Promise<{ correct: boolean, issue: string, severity: string }>}
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
