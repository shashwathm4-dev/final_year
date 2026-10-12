/**
 * Gemini API service — wraps Google Generative AI client for exercise form verification.
 * Features automatic model failovers, 503 high-demand handling, and local checkpoint fallbacks.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const MODEL_NAMES = (process.env.GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.0-flash')
  .split(',')
  .map((s) => s.trim());

const lastVlmCallBySession = new Map();
const VLM_COOLDOWN_MS = Number(process.env.VLM_COOLDOWN_MS) || 8000;

const skipped = (reason, message) => ({
  correct: null,
  issue: message,
  severity: 'low',
  source: 'skipped',
  skipReason: reason, // 'no_api_key' | 'cooldown' | 'no_frame' | 'quota' | 'models_unavailable'
});

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
 * @param {object|null} [exercise=null] - Full exercise config for context
 * @returns {Promise<{ correct: boolean|null, issue: string, severity: string, source: 'vlm'|'skipped'|'error', skipReason?: string }>}
 */
async function verifyExerciseForm(patientFrameB64, referenceFrameB64, exerciseName, sessionId = 'anonymous', exercise = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return skipped('no_api_key', 'AI visual check not configured');
  }

  // Throttle per session to respect Free Tier quota
  const sessionKey = sessionId || 'anonymous';
  const now = Date.now();
  const lastCallTime = lastVlmCallBySession.get(sessionKey) || 0;
  if (now - lastCallTime < VLM_COOLDOWN_MS) {
    console.log(`[Gemini Cooldown] Skipping VLM verification for session: ${sessionKey}`);
    return skipped('cooldown', 'AI visual check skipped (rate limit)');
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
    return skipped('no_frame', 'No camera frame available for AI check');
  }

  const context = exercise
    ? `Exercise description: ${exercise.description || 'n/a'}. Target joint-angle range: ${
        (exercise.target_angle_range || []).join('–')
      } degrees.`
    : '';

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
${context}
Compare the patient's body position to the reference at the peak of the movement.

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
${context}
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
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              correct: { type: 'BOOLEAN' },
              issue: { type: 'STRING' },
              severity: { type: 'STRING', enum: ['low', 'medium', 'high'] },
            },
            required: ['correct', 'issue', 'severity'],
          },
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
        return skipped('quota', 'AI visual check skipped (quota reached)');
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
  return skipped('models_unavailable', 'AI visual check temporarily unavailable');
}

module.exports = { verifyExerciseForm, MODEL_NAMES };
