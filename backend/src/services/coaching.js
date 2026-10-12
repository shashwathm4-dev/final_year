/**
 * Gemini Coaching Summary generator.
 * Analyzes session metrics, fatigue, and form issues to generate concise clinical coaching.
 * Falls back to deterministic rule-based coaching when Gemini is unavailable.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MODEL_NAMES } = require('./gemini');
require('dotenv').config();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const userThrottleMap = new Map(); // uid -> lastTs
const THROTTLE_MS = 15000;

function ruleBasedSummary(digest) {
  const { exerciseName, reps, accuracy, avgQuality, fatigue, topIssues, previousDeltas } = digest;
  const wins = [];
  const focusAreas = [];

  if (accuracy >= 80) {
    wins.push(`High accuracy of ${accuracy}% maintained throughout the set.`);
  } else if (reps > 0) {
    wins.push(`Successfully completed ${reps} repetitions.`);
  }

  if (avgQuality >= 75) {
    wins.push(`Overall movement quality averaged ${avgQuality}/100.`);
  }

  if (topIssues && topIssues.length > 0) {
    focusAreas.push(`Pay attention to: ${topIssues[0].label}.`);
  }

  if (fatigue && fatigue.level !== 'none') {
    focusAreas.push(`Fatigue (${fatigue.level}) was observed; keep rest intervals consistent.`);
  }

  if (wins.length === 0) wins.push('Completed session routines consistently.');
  if (focusAreas.length === 0) focusAreas.push('Focus on maintaining smooth tempo and full range of motion.');

  let headline = `Good effort on your ${exerciseName || 'exercise'} session`;
  if (accuracy >= 85) headline = `Excellent form on ${exerciseName || 'exercise'}!`;
  else if (accuracy < 50) headline = `Session completed: focus on movement alignment next time`;

  const deltaText = previousDeltas?.accuracy != null
    ? ` Compared to your previous session, accuracy changed by ${previousDeltas.accuracy >= 0 ? '+' : ''}${previousDeltas.accuracy}%.`
    : '';

  const summary = `You logged ${reps} reps with ${accuracy}% accuracy and an average form quality of ${avgQuality}/100.${deltaText} Stay consistent and prioritize controlled movement.`;

  return {
    headline,
    summary: summary.slice(0, 500),
    wins: wins.slice(0, 3),
    focusAreas: focusAreas.slice(0, 3),
    nextStep: fatigue?.level === 'high' ? 'Take an extended rest and hydrate before your next set.' : 'Aim for steady pacing and controlled peak holds in your next session.',
    safetyNote: 'If you feel sharp or persistent joint pain, stop the exercise immediately and consult your physiotherapist.',
    source: 'rule-based',
  };
}

/**
 * Generate AI coaching summary using Gemini, with model failover and rule-based fallback.
 */
async function generateCoachingSummary({ session, summary, exerciseName, riskFlags, previousDeltas, uid }) {
  const reps = session.reps || [];
  const repCount = summary?.repCount ?? reps.length;
  const accuracy = summary?.accuracy ?? (repCount > 0 ? Math.round((session.correctReps / repCount) * 100) : 0);
  const avgQuality = summary?.avgQuality ?? 0;
  const avgPeakAngle = summary?.avgPeakAngle ?? 0;
  const maxPeakAngle = summary?.maxPeakAngle ?? 0;
  const fatigue = summary?.fatigue ?? { level: 'none', signals: [] };

  // Top issues tally
  const issueCounts = {};
  for (const r of reps) {
    if (r.correct === false && r.issue) {
      issueCounts[r.issue] = (issueCounts[r.issue] || 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count]) => ({ label, count }));

  const digest = {
    exerciseName: exerciseName || session.exerciseId,
    reps: repCount,
    accuracy,
    avgQuality,
    avgPeakAngle,
    maxPeakAngle,
    fatigue,
    topIssues,
    previousDeltas,
    riskFlags: riskFlags || [],
  };

  // Check user throttle
  if (uid) {
    const lastTime = userThrottleMap.get(uid);
    if (lastTime && Date.now() - lastTime < THROTTLE_MS) {
      return ruleBasedSummary({ ...digest, reason: 'cooldown' });
    }
    userThrottleMap.set(uid, Date.now());
  }

  if (!genAI || !process.env.GEMINI_API_KEY) {
    return ruleBasedSummary({ ...digest, reason: 'no_api_key' });
  }

  const prompt = `You are an AI physiotherapy coaching assistant analyzing a patient's exercise session data.
Generate an encouraging, clinically grounded, objective coaching summary.

Data:
Exercise: ${digest.exerciseName}
Completed Reps: ${digest.reps}
Accuracy: ${digest.accuracy}%
Average Quality: ${digest.avgQuality}/100
Average Peak Angle: ${digest.avgPeakAngle}° (Max: ${digest.maxPeakAngle}°)
Fatigue Status: ${digest.fatigue.level} (${digest.fatigue.signals?.map((s) => s.label).join(', ') || 'none'})
Top Form Issues: ${topIssues.map((i) => `${i.label} (x${i.count})`).join('; ') || 'None'}
Comparison to Previous Session: ${previousDeltas ? JSON.stringify(previousDeltas) : 'N/A'}
Risk Indicators: ${digest.riskFlags.map((f) => f.message).join('; ') || 'None'}

Rules:
1. Speak directly to the patient in second person ("You...").
2. Total text in "summary" must be <= 90 words.
3. Be encouraging but completely honest about form issues.
4. DO NOT diagnose any condition or prescribe medication.
5. Advise stopping and contacting their physiotherapist if pain is mentioned.
6. Return strictly a JSON object with this schema:
{
  "headline": string,
  "summary": string,
  "wins": string[], // max 3 short bullet points
  "focusAreas": string[], // max 3 short bullet points
  "nextStep": string,
  "safetyNote": string
}`;

  for (const modelName of MODEL_NAMES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      });

      const text = response.response.text();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found in response');

      const parsed = JSON.parse(match[0]);
      if (!parsed.headline || !parsed.summary) throw new Error('Missing required fields');

      return {
        headline: String(parsed.headline).slice(0, 150),
        summary: String(parsed.summary).slice(0, 600),
        wins: Array.isArray(parsed.wins) ? parsed.wins.slice(0, 3).map((w) => String(w).slice(0, 150)) : [],
        focusAreas: Array.isArray(parsed.focusAreas) ? parsed.focusAreas.slice(0, 3).map((f) => String(f).slice(0, 150)) : [],
        nextStep: String(parsed.nextStep || 'Keep up the routine with steady progress.').slice(0, 200),
        safetyNote: String(parsed.safetyNote || 'Consult your physiotherapist if you experience discomfort.').slice(0, 200),
        source: 'gemini',
      };
    } catch (err) {
      console.warn(`[Coaching] Model ${modelName} error:`, err.message);
    }
  }

  return ruleBasedSummary({ ...digest, reason: 'models_unavailable' });
}

module.exports = {
  generateCoachingSummary,
  ruleBasedSummary,
};
