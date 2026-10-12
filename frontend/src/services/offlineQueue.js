/**
 * Offline queue — stores session/rep/end requests that could not reach the server.
 * Items are replayed in order by flushOfflineQueue() in api.js.
 * Item shapes: { type: 'start', localId, exerciseId } | { type: 'rep', payload } | { type: 'end', payload }
 */
const KEY = 'offline_queue_v1';
const MAP_KEY = 'offline_session_map';
const MAX_ITEMS = 500;
const listeners = new Set();

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function write(queue) {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch (err) {
    console.warn('Offline queue could not be saved:', err.message);
  }
  listeners.forEach((fn) => fn(queue.length));
}

export function enqueue(item) {
  const queue = read();
  queue.push({ ...item, queuedAt: Date.now() });
  write(queue.slice(-MAX_ITEMS)); // drop the oldest if the queue ever overflows
}

export function peekQueue() {
  return read();
}

export function dropFirst() {
  const queue = read();
  queue.shift();
  write(queue);
}

export function queueSize() {
  return read().length;
}

export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readSessionMap() {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY)) || {};
  } catch {
    return {};
  }
}

export function writeSessionMap(map) {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** True when the failure means "try again later" (no connection, timeout, server error). */
export function isNetworkError(err) {
  return !err.response || err.code === 'ECONNABORTED' || err.response.status >= 500;
}

/** Wipe queued data and cached API responses (used on sign-out and account deletion). */
export function clearOfflineData() {
  write([]);
  try {
    localStorage.removeItem(MAP_KEY);
  } catch {
    // ignore
  }
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('CLEAR_API_CACHE');
  }
}
