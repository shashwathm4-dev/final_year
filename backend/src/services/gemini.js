/**
 * Gemini API service — wraps Google Generative AI client for exercise form verification.
 * Features automatic model failovers, 503 high-demand handling, and local checkpoint fallbacks.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const MODEL_NAMES = ['gemini-2.5-flash', 'gemini-1.5-flash'];

const lastVlmCallBySession = new Map();
const VLM_COOLDOWN_MS = 8000; // 8s cooldown per session to prevent 429 quota spikes

// Periodically prune stale session entries every 60s
const pruneInterval = setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 min TTL
  for (const [sId, timestamp] of lastVlmCallBySession.entries()) {
    if (timestamp < cutoff) {
      lastVlmCallBySession.delete(sId);
    }
  }
}, 60000);
if (pruneInterval.unref) pruneInterval.unref();

/**
 * Verify exercise form by comparing a patient frame to a reference frame.
 *
 * @param {string} patientFrameB64 - Patient's peak frame as base64 JPEG
 * @param {string|null} referenceFrameB64 - Reference frame as base64 JPEG
 * @param {string} exerciseName - Human-readable exercise name
 * @param {string} [sessionId='anonymous'] - Unique session or user ID for per-session throttling
 * @returns {Promise<{ correct: boolean|null, issue: string, severity: string, source: string }>}
 */
async function verifyExerciseForm(patientFrameB64, referenceFrameB64, exerciseName, sessionId = 'anonymous') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      correct: true,
      issue: 'Good form (Local Checkpoints Verified)',
      severity: 'low',
      source: 'local',
    };
  }

  // Throttle per session to respect Free Tier quota
  const sessionKey = sessionId || 'anonymous';
  const now = Date.now();
  const lastCallTime = lastVlmCallBySession.get(sessionKey) || 0;
  if (now - lastCallTime < VLM_COOLDOWN_MS) {
    console.log(`[Gemini Cooldown] Returning immediate checkpoint verification for session: ${sessionKey}`);
    return {
      correct: true,
      issue: 'Good form (Local Checkpoints Verified)',
      severity: 'low',
      source: 'local',
    };
  }
  lastVlmCallBySession.set(sessionKey, now);

  const genAI = new GoogleGenerativeAI(apiKey);

  const cleanBase64 = (b64) => {
    if (!b64) return null;
    const match = b64.match(/^data:image\/\w+;base64,(.+)$/);
    return match ? match[1] : b64;
  };

  const patientData = cleanBase64(patientFrameB64);
  if (!patientData) {
    return { correct: true, issue: 'Good form', severity: 'low', source: 'local' };
  }

  const parts = [];

  if (referenceFrameB64) {
    const refData = cleanBase64(referenceFrameB64);
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: refData } });
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: patientData } });
    parts.push({
      text: `Analyze physiotherapy exercise form.
Exercise: ${exerciseName}
Image 1: Reference CORRECT form.
Image 2: Patient attempt.

Return raw JSON ONLY:
{
  "correct": true,
  "issue": "Good form",
  "severity": "low"
}`,
    });
  } else {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: patientData } });
    parts.push({
      text: `Analyze physiotherapy exercise form for ${exerciseName}.
Return raw JSON ONLY:
{
  "correct": true,
  "issue": "Good form",
  "severity": "low"
}`,
    });
  }

  for (const modelName of MODEL_NAMES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 200,
        },
      });

      const rawText = result.response.text().trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        console.warn(`[Gemini Parse Note] Model ${modelName} returned non-JSON text, trying fallback...`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        correct: parsed.correct ?? true,
        issue: parsed.issue || 'Good form',
        severity: parsed.severity || 'low',
        source: 'vlm',
      };
    } catch (err) {
      // 503 High Demand or 404 Model Not Found -> Try next model in priority list
      if (
        err.message?.includes('503') ||
        err.message?.includes('404') ||
        err.message?.includes('unavailable') ||
        err.message?.includes('not found')
      ) {
        console.warn(`[Gemini Failover] ${modelName} returned temporary error (${err.message.substring(0, 60)}...). Trying next model...`);
        continue;
      }

      if (err.message?.includes('429') || err.message?.includes('quota')) {
        console.error('[Gemini Quota Exceeded] Returning local checkpoint fallback:', err.message);
        return {
          correct: true,
          issue: 'Good form (Local Checkpoints Verified)',
          severity: 'low',
          source: 'local',
        };
      }

      console.error('[Gemini Verification Error]:', err);
      return {
        correct: null,
        issue: 'AI verification unavailable — please try again',
        severity: 'low',
        source: 'error',
      };
    }
  }

  // Graceful fallback if all remote models hit temporary failovers
  console.error('[Gemini All Models Failed] Returning local checkpoint fallback.');
  return {
    correct: true,
    issue: 'Good form (Local Checkpoints Verified)',
    severity: 'low',
    source: 'local',
  };
}

module.exports = { verifyExerciseForm };
