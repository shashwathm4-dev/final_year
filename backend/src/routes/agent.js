/**
 * agent.js
 * Express router for live coaching chatbot and assistant.
 * Mounted at /api/agent.
 *
 * Endpoints:
 * - POST /live   - Ingest live snapshots & rep events (204 No Content).
 * - POST /chat   - Streaming SSE chat with Gemini agent / rule-based fallback.
 * - POST /assist - Automated assist SSE for repeated mistakes, fatigue, tracking loss (20s cooldown).
 * - GET  /status - { llm: boolean, consentRequired: boolean }
 */

const express = require('express');
const router = express.Router();

const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { agentLiveLimiter, agentChatLimiter } = require('../middleware/rateLimits');
const { agentLiveSchema, agentChatSchema, agentAssistSchema } = require('../validation/schemas');

const { recordLivePush } = require('../services/agent/liveStore');
const { runCoachAgent } = require('../services/agent/coachAgent');
const { getUserProfile, getSession } = require('../services/firestore');

// Per-user locks and cooldowns for chat/assist
const activeChatsByUser = new Set();
const lastAssistByUser = new Map();
const ASSIST_COOLDOWN_MS = 20 * 1000; // 20s

/**
 * Helper to check whether user has granted cloud-AI consent.
 */
async function checkUserConsent(uid) {
  try {
    const profile = await getUserProfile(uid);
    return Boolean(profile?.consent?.cloudAi);
  } catch (err) {
    return false;
  }
}

/**
 * GET /api/agent/status
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    const hasConsent = await checkUserConsent(req.user.uid);
    res.json({
      llm: Boolean(hasKey && hasConsent),
      consentRequired: !hasConsent,
      hasApiKey: hasKey,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read agent status' });
  }
});

/**
 * POST /api/agent/live
 * Ingest live snapshots & rep events into liveStore.
 */
router.post(
  '/live',
  requireAuth,
  agentLiveLimiter,
  validate(agentLiveSchema),
  async (req, res) => {
    try {
      const { sessionId, exerciseId, snapshot, events } = req.body;

      // Validate session ownership: starts with 'local_' or belongs to this user in store
      if (!sessionId.startsWith('local_')) {
        const storedSession = await getSession(sessionId);
        if (storedSession && storedSession.patientId && storedSession.patientId !== req.user.uid) {
          return res.status(403).json({ error: 'Forbidden: not your session' });
        }
      }

      recordLivePush(req.user.uid, {
        sessionId,
        exerciseId,
        snapshot,
        events,
      });

      res.status(204).end();
    } catch (err) {
      console.error('[agent/live] error:', err);
      res.status(500).json({ error: 'Failed to record live state' });
    }
  }
);

/**
 * Setup Server-Sent Events headers.
 */
function setupSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

function sendSseEvent(res, eventName, data) {
  res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/agent/chat
 * User-initiated conversational question.
 */
router.post(
  '/chat',
  requireAuth,
  agentChatLimiter,
  validate(agentChatSchema),
  async (req, res) => {
    const uid = req.user.uid;

    if (activeChatsByUser.has(uid)) {
      return res.status(429).json({ error: 'Another agent request is already in progress' });
    }

    activeChatsByUser.add(uid);
    setupSse(res);

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
      activeChatsByUser.delete(uid);
    });

    try {
      const hasConsent = await checkUserConsent(uid);
      const result = await runCoachAgent({
        user: req.user,
        message: req.body.message,
        history: req.body.history || [],
        reason: 'chat',
        hasConsent,
        onToken: (text) => sendSseEvent(res, 'token', { text }),
        onTool: (name) => sendSseEvent(res, 'tool', { name }),
        abortSignal: abortController.signal,
      });

      sendSseEvent(res, 'done', { source: result.source });
    } catch (err) {
      if (!abortController.signal.aborted) {
        console.error('[agent/chat] error:', err.message);
        sendSseEvent(res, 'error', { error: err.message || 'Chat error' });
      }
    } finally {
      activeChatsByUser.delete(uid);
      res.end();
    }
  }
);

/**
 * POST /api/agent/assist
 * Triggered automatically by frontend on repeated mistakes, high fatigue, or tracking loss.
 */
router.post(
  '/assist',
  requireAuth,
  validate(agentAssistSchema),
  async (req, res) => {
    const uid = req.user.uid;
    const { reason = 'repeated_issue', issue, count } = req.body;

    const now = Date.now();
    const lastAssist = lastAssistByUser.get(uid) || 0;
    const isCoolingDown = now - lastAssist < ASSIST_COOLDOWN_MS;

    setupSse(res);

    const abortController = new AbortController();
    req.on('close', () => {
      abortController.abort();
    });

    try {
      // If cooling down, force deterministic rule-based response without hitting Gemini
      const hasConsent = isCoolingDown ? false : await checkUserConsent(uid);

      if (!isCoolingDown) {
        lastAssistByUser.set(uid, now);
      }

      let prompt = '';
      if (reason === 'repeated_issue') {
        prompt = `The user repeated the mistake "${issue || 'form deviation'}" ${count || 3} times in a row.`;
      } else if (reason === 'fatigue') {
        prompt = `Severe fatigue detected across recent reps.`;
      } else if (reason === 'tracking') {
        prompt = `Camera tracking is lost or unstable.`;
      } else if (reason === 'stalled') {
        prompt = `The user has been still with no reps logged for over 10 seconds.`;
      }

      const result = await runCoachAgent({
        user: req.user,
        message: prompt,
        reason,
        hasConsent,
        onToken: (text) => sendSseEvent(res, 'token', { text }),
        onTool: (name) => sendSseEvent(res, 'tool', { name }),
        abortSignal: abortController.signal,
      });

      sendSseEvent(res, 'done', { source: result.source, cooldown: isCoolingDown });
    } catch (err) {
      if (!abortController.signal.aborted) {
        console.error('[agent/assist] error:', err.message);
        sendSseEvent(res, 'error', { error: err.message || 'Assist error' });
      }
    } finally {
      res.end();
    }
  }
);

module.exports = router;
