/**
 * API service — frontend wrapper for backend calls.
 */
import axios from 'axios';
import { auth } from '../config/firebase';
import {
  enqueue,
  peekQueue,
  dropFirst,
  readSessionMap,
  writeSessionMap,
  isNetworkError,
} from './offlineQueue';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 6000, // 6s fast fail so UI is snappy; verification calls can use custom timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Firebase Auth ID token and role hint to every outgoing request
api.interceptors.request.use(async (config) => {
  try {
    if (auth && auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
      if (auth.currentUser.email) {
        config.headers['X-User-Email'] = auth.currentUser.email;
      }
      const cachedRole = localStorage.getItem('user_role');
      if (cachedRole) {
        config.headers['X-User-Role'] = cachedRole;
      }
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
 * Program endpoints (item 25)
 */
export async function getPrograms() {
  try {
    const res = await api.get('/programs');
    return res.data.programs || [];
  } catch (err) {
    console.warn('Failed to fetch programs:', err.message);
    return [];
  }
}

export async function createProgram(data) {
  const res = await api.post('/programs', data);
  return res.data;
}

export async function deleteProgram(id) {
  const res = await api.delete(`/programs/${id}`);
  return res.data;
}

export async function assignProgramToPatient(programId, patientId) {
  const res = await api.post(`/programs/${programId}/assign`, { patientId });
  return res.data;
}

export async function getMyPrograms() {
  try {
    const res = await api.get('/programs/my');
    return res.data.programs || [];
  } catch (err) {
    console.warn('Failed to fetch my programs:', err.message);
    return [];
  }
}

export async function getPatientPrograms(patientId) {
  try {
    const res = await api.get(`/programs/patient/${patientId}`);
    return res.data.programs || [];
  } catch (err) {
    console.warn('Failed to fetch patient programs:', err.message);
    return [];
  }
}

/**
 * Clinic endpoints (item 27)
 */
export async function getMyClinic() {
  try {
    const res = await api.get('/clinics/me');
    return res.data;
  } catch (err) {
    console.warn('Failed to fetch clinic:', err.message);
    return { clinic: null };
  }
}

export async function createClinic(name) {
  const res = await api.post('/clinics', { name });
  return res.data;
}

export async function joinClinic(inviteCode) {
  const res = await api.post('/clinics/join', { inviteCode });
  return res.data;
}

export async function leaveClinic() {
  const res = await api.post('/clinics/leave');
  return res.data;
}

export async function regenerateInviteCode() {
  const res = await api.post('/clinics/invite-code');
  return res.data;
}

export async function removeClinicMember(doctorId) {
  const res = await api.delete(`/clinics/members/${doctorId}`);
  return res.data;
}

export async function reassignPatient(patientId, doctorId) {
  const res = await api.post('/clinics/reassign', { patientId, doctorId });
  return res.data;
}

export async function getClinicPatients() {
  const res = await api.get('/users/patients', { params: { scope: 'clinic' } });
  return res.data.patients || [];
}

/**
 * PDF report download (item 26). Pass a patientId for the doctor view; omit it for the patient's own report.
 */
export async function downloadProgressReport(patientId = null, days = 30) {
  const url = patientId ? `/reports/patient/${patientId}` : '/reports/me';
  const res = await api.get(url, { params: { days }, responseType: 'blob', timeout: 30000 });
  const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `progress-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
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
 * @param {Object} extra
 * @returns {Promise<{ sessionId: string }>}
 */
export async function startSession(exerciseId, extra = {}) {
  const makeLocalSession = () => {
    const localId = `local_${Date.now()}`;
    enqueue({ type: 'start', localId, exerciseId, extra });
    return { sessionId: localId };
  };

  if (!navigator.onLine) return makeLocalSession();

  try {
    const res = await api.post('/session/start', { exerciseId, ...extra });
    return res.data;
  } catch (err) {
    console.warn('Failed to start session on backend — running offline', err.message);
    if (isNetworkError(err)) return makeLocalSession();
    return { sessionId: `local_${Date.now()}` };
  }
}

export async function logRep(repData) {
  const isLocalSession = String(repData.sessionId || '').startsWith('local_');
  if (isLocalSession || !navigator.onLine) {
    enqueue({ type: 'rep', payload: repData });
    return;
  }
  try {
    await api.post('/session/log-rep', repData);
  } catch (err) {
    console.warn('Failed to log rep:', err.message);
    if (isNetworkError(err)) enqueue({ type: 'rep', payload: repData });
  }
}

export async function endSession(sessionData) {
  const isLocalSession = String(sessionData.sessionId || '').startsWith('local_');
  if (isLocalSession || !navigator.onLine) {
    enqueue({ type: 'end', payload: sessionData });
    try {
      window.dispatchEvent(new CustomEvent('session-completed', { detail: sessionData }));
    } catch (_) {}
    return { success: false, queued: true };
  }
  try {
    const res = await api.post('/session/end', sessionData);
    try {
      window.dispatchEvent(new CustomEvent('session-completed', { detail: sessionData }));
    } catch (_) {}
    return res.data;
  } catch (err) {
    console.warn('Failed to end session on backend:', err.message);
    if (isNetworkError(err)) {
      enqueue({ type: 'end', payload: sessionData });
      try {
        window.dispatchEvent(new CustomEvent('session-completed', { detail: sessionData }));
      } catch (_) {}
      return { success: false, queued: true };
    }
    return { success: false };
  }
}


/**
 * Replay queued offline requests in order. Safe to call repeatedly.
 * Stops at the first network failure; drops items the server rejects (4xx).
 */
let flushing = false;
export async function flushOfflineQueue() {
  if (flushing || !navigator.onLine || !auth || !auth.currentUser) return;
  flushing = true;
  try {
    const map = readSessionMap();
    while (peekQueue().length > 0) {
      const item = peekQueue()[0];
      try {
        if (item.type === 'start') {
          const res = await api.post('/session/start', { exerciseId: item.exerciseId, ...(item.extra || {}) });
          map[item.localId] = res.data.sessionId;
          writeSessionMap(map);
        } else {
          const payload = { ...item.payload };
          const realId = map[payload.sessionId] || payload.sessionId;
          if (String(realId).startsWith('local_')) {
            dropFirst(); // its session was never created — nothing to attach it to
            continue;
          }
          payload.sessionId = realId;
          if (item.type === 'rep') await api.post('/session/log-rep', payload);
          else if (item.type === 'end') await api.post('/session/end', payload);
        }
        dropFirst();
      } catch (err) {
        if (isNetworkError(err)) break; // still offline — try again later
        dropFirst(); // server rejected this item; do not retry forever
      }
    }
  } finally {
    flushing = false;
  }
}


/**
 * Send a rep's peak frame to the backend for Gemini VLM verification.
 * @param {{ patientFrame: string, referenceFrame: string, exerciseId: string, sessionId?: string }} payload
 * @returns {Promise<{ correct: boolean|null, issue: string, severity: string, source: string }>}
 */
export async function verifyRep(payload) {
  try {
    const res = await api.post('/verify-rep', payload, { timeout: 30000 });
    return res.data;
  } catch (err) {
    if (err.response?.status === 429) {
      return {
        correct: null,
        issue: 'AI check skipped (rate limit)',
        severity: 'low',
        source: 'error',
      };
    }
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

/**
 * Doctor features: adherence, trends, playback, comments
 */
export async function getAdherence() {
  const res = await api.get('/analytics/adherence');
  return res.data.adherence || res.data;
}

export async function getPatientTrends(patientId) {
  const res = await api.get(`/analytics/patient/${patientId}/trends`);
  return res.data;
}

export async function logRepPlayback(sessionId, repNumber, payload) {
  try {
    await api.post(`/session/${sessionId}/playback/${repNumber}`, payload, { timeout: 15000 });
  } catch (err) {
    console.warn('Failed to store playback:', err.message);
  }
}

export async function getRepPlayback(sessionId, repNumber) {
  const res = await api.get(`/session/${sessionId}/playback/${repNumber}`, { timeout: 15000 });
  return res.data;
}

export async function getSessionComments(sessionId) {
  const res = await api.get(`/comments/session/${sessionId}`);
  return res.data.comments || [];
}

export async function postSessionComment(sessionId, text, repNumber = null) {
  const res = await api.post(`/comments/session/${sessionId}`, { text, repNumber });
  return res.data.comment;
}

export async function markCommentsRead(sessionId) {
  await api.post(`/comments/session/${sessionId}/read`);
}

export async function getUnreadComments() {
  try {
    const res = await api.get('/comments/unread');
    const d = res.data || {};
    const bySession = d.bySession || d.counts || {};
    const total = typeof d.total === 'number'
      ? d.total
      : Object.values(bySession).reduce((a, b) => a + b, 0);
    return { total, bySession };
  } catch {
    return { total: 0, bySession: {} };
  }
}

/**
 * 28 – Gemini Coaching Summary
 */
export async function getCoachingSummary(sessionId, refresh = false) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  try {
    const res = await api.post(`/session/${sessionId}/coaching${refresh ? '?refresh=1' : ''}`, {}, { timeout: 30000 });
    return res.data;
  } catch (err) {
    console.warn('Failed to get coaching summary:', err.message);
    return null;
  }
}

/**
 * 29 – Personalized Difficulty
 */
export async function getPersonalization(exerciseId) {
  try {
    const res = await api.get(`/insights/personalization/${exerciseId}`);
    return res.data;
  } catch (err) {
    console.warn('Failed to get personalization:', err.message);
    return null;
  }
}

/**
 * 30 – Risk & Trend Screening
 */
export async function getMyRisk() {
  try {
    const res = await api.get('/insights/risk/me');
    return res.data;
  } catch (err) {
    console.warn('Failed to get my risk:', err.message);
    return { results: [] };
  }
}

export async function getPatientRisk(patientId) {
  try {
    const res = await api.get(`/insights/risk/patient/${patientId}`);
    return res.data;
  } catch (err) {
    console.warn('Failed to get patient risk:', err.message);
    return { results: [] };
  }
}

/**
 * 31 – On-device Rep Classifier Models
 */
export async function getRepModel(exerciseId) {
  try {
    const res = await api.get(`/models/rep-classifier/${exerciseId}`);
    return res.data;
  } catch (err) {
    return null;
  }
}

export async function trainRepModel(exerciseId) {
  const res = await api.post(`/models/rep-classifier/${exerciseId}/train`);
  return res.data;
}

/**
 * Privacy endpoints (item 36)
 */
export async function fetchConsent() {
  try {
    const res = await api.get('/privacy/consent');
    return res.data.consent || null;
  } catch {
    return null;
  }
}

export async function saveConsent(consent) {
  const res = await api.post('/privacy/consent', consent);
  return res.data;
}

export async function deleteMyAccount() {
  const res = await api.delete('/privacy/my-data', { data: { confirm: 'DELETE' } });
  return res.data;
}

/**
 * Real-time ML and Data Mining Analytics endpoints
 */
export async function getPatientMLMining(patientId) {
  const res = await api.get(`/analytics/ml-mining/patient/${patientId}`);
  return res.data;
}

export async function getDoctorMLMining() {
  const res = await api.get('/analytics/ml-mining/doctor');
  return res.data;
}

export async function getClinicMLMining() {
  const res = await api.get('/analytics/ml-mining/clinic');
  return res.data;
}

/**
 * Agent coaching API helpers
 */
export async function getAgentStatus() {
  try {
    const res = await api.get('/agent/status');
    return res.data;
  } catch (err) {
    return { llm: false, consentRequired: true, hasApiKey: false };
  }
}

/**
 * Stream SSE events from /api/agent/* using fetch and ReadableStream.
 * Handles Authorization token and parses SSE lines.
 *
 * @param {string} path - '/agent/chat' or '/agent/assist'
 * @param {Object} body
 * @param {Object} handlers - { onToken, onTool, onDone, onError }
 * @param {AbortSignal} signal
 */
export async function streamAgent(path, body, handlers = {}, signal) {
  const { onToken, onTool, onDone, onError } = handlers;
  let token = null;
  if (auth && auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch (e) {
      console.warn('Could not retrieve token for agent stream:', e.message);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const endpoint = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `Request failed: ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error) errMsg = parsed.error;
      } catch {}
      if (onError) onError(new Error(errMsg));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      buffer = lines.pop(); // keep last incomplete chunk

      for (const block of lines) {
        if (!block.trim()) continue;
        const subLines = block.split('\n');
        let currentEvent = 'message';
        let currentData = '';

        for (const line of subLines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim();
          }
        }

        try {
          const parsed = currentData ? JSON.parse(currentData) : {};
          if (currentEvent === 'token' && onToken && parsed.text) {
            onToken(parsed.text);
          } else if (currentEvent === 'tool' && onTool && parsed.name) {
            onTool(parsed.name);
          } else if (currentEvent === 'done' && onDone) {
            onDone(parsed);
          } else if (currentEvent === 'error' && onError) {
            onError(new Error(parsed.error || 'Agent stream error'));
          }
        } catch (parseErr) {
          console.warn('[streamAgent] SSE parse error:', parseErr.message, currentData);
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    if (onError) onError(err);
  }
}



