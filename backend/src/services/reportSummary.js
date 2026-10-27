/**
 * reportSummary.js
 * Generates an executive AI or deterministic clinical summary for PDF progress reports.
 * Strict rules:
 * - NO patient name, email, or frames sent to Gemini (privacy-safe numbers-only digest).
 * - Gemini called ONLY if patient granted cloud-AI consent AND GEMINI_API_KEY is present.
 * - Fails over through MODEL_NAMES, then falls back to deterministic rule-based summary.
 * - 8s timeout using Promise.race.
 * - Zero sessions returns rule-based summary without calling Gemini.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MODEL_NAMES } = require('./gemini');
require('dotenv').config();

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

function sanitizePdfText(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    // Replace characters outside Latin-1 printable range
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .trim();
}

function buildDigest({ days, sessions, programs, risk }) {
  const count = sessions.length;
  const totalReps = sessions.reduce((sum, s) => sum + (s.totalReps || 0), 0);
  const correctReps = sessions.reduce((sum, s) => sum + (s.correctReps || 0), 0);
  const accuracy = totalReps > 0 ? Math.round((correctReps / totalReps) * 100) : 0;

  const allReps = sessions.flatMap((s) => s.reps || []);
  const validQuals = allReps.filter((r) => typeof r.qualityScore === 'number' && !Number.isNaN(r.qualityScore));
  const avgQuality = validQuals.length ? Math.round(validQuals.reduce((a, b) => a + b.qualityScore, 0) / validQuals.length) : null;

  const validRoms = allReps.filter((r) => typeof r.romScore === 'number' && !Number.isNaN(r.romScore));
  const avgRom = validRoms.length ? Math.round(validRoms.reduce((a, b) => a + b.romScore, 0) / validRoms.length) : null;

  // Per-exercise performance
  const byExercise = {};
  sessions.forEach((s) => {
    const ex = s.exerciseId || 'general';
    if (!byExercise[ex]) byExercise[ex] = { total: 0, correct: 0 };
    byExercise[ex].total += s.totalReps || 0;
    byExercise[ex].correct += s.correctReps || 0;
  });
  const exerciseAccuracy = {};
  Object.entries(byExercise).forEach(([k, v]) => {
    exerciseAccuracy[k] = v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0;
  });

  // Trend: first half vs second half
  let trendDirection = 'stable';
  if (count >= 2) {
    const half = Math.floor(count / 2);
    // sessions are sorted descending (newest first) or ascending; let's sort ascending for chronological
    const chrono = [...sessions].sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
    const firstHalf = chrono.slice(0, half);
    const secondHalf = chrono.slice(half);

    const calcAcc = (arr) => {
      const tot = arr.reduce((acc, s) => acc + (s.totalReps || 0), 0);
      const cor = arr.reduce((acc, s) => acc + (s.correctReps || 0), 0);
      return tot > 0 ? (cor / tot) * 100 : 0;
    };
    const acc1 = calcAcc(firstHalf);
    const acc2 = calcAcc(secondHalf);
    if (acc2 - acc1 >= 5) trendDirection = 'improving';
    else if (acc1 - acc2 >= 5) trendDirection = 'declining';
  }

  // Top issues
  const issueCounts = {};
  allReps.forEach((r) => {
    if (r.correct === false && r.issue) {
      issueCounts[r.issue] = (issueCounts[r.issue] || 0) + 1;
    }
  });
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([issue, cnt]) => `${issue} (${cnt}x)`);

  // Fatigue frequency
  let fatigueSessions = 0;
  sessions.forEach((s) => {
    if (s.summary?.fatigue && s.summary.fatigue.level !== 'none') {
      fatigueSessions++;
    }
  });

  // Active program adherence
  const activeProgram = (programs || []).find((p) => p.status === 'active');
  const programDetails = activeProgram ? {
    name: activeProgram.programName,
    exercises: (activeProgram.items || []).map((it) => it.exerciseName),
  } : null;

  return {
    days,
    sessionCount: count,
    totalReps,
    correctReps,
    accuracy,
    avgQuality,
    avgRom,
    exerciseAccuracy,
    trendDirection,
    topIssues,
    fatigueSessions,
    activeProgram: programDetails,
    riskFlags: risk?.flags || [],
  };
}

function buildRuleBasedSummary(digest) {
  if (!digest || digest.sessionCount === 0) {
    return {
      headline: 'No Exercise Sessions Recorded',
      overview: `No exercise sessions were completed in the last ${digest?.days || 30} days. Consistent movement is key to functional recovery; please review your assigned home program.`,
      highlights: ['No active sessions to report.'],
      concerns: ['Lack of activity during this period may delay recovery milestones.'],
      recommendations: ['Schedule an initial rehabilitation session with your clinician or resume your prescribed routine.'],
      source: 'rule-based',
    };
  }

  const { sessionCount, totalReps, accuracy, avgQuality, trendDirection, topIssues, fatigueSessions, riskFlags } = digest;
  const highlights = [];
  const concerns = [];
  const recommendations = [];

  if (accuracy >= 80) {
    highlights.push(`Strong overall movement accuracy of ${accuracy}% across ${sessionCount} sessions.`);
  } else {
    highlights.push(`Completed ${sessionCount} sessions with ${totalReps} total repetitions.`);
  }

  if (avgQuality && avgQuality >= 75) {
    highlights.push(`Maintained high average form quality score of ${avgQuality}/100.`);
  } else if (trendDirection === 'improving') {
    highlights.push('Demonstrated positive progress and technique stability across consecutive sessions.');
  }

  if (topIssues && topIssues.length > 0) {
    concerns.push(`Frequent compensation or posture deviation: ${topIssues[0]}.`);
  }
  if (fatigueSessions > 0) {
    concerns.push(`Fatigue detected in ${fatigueSessions} session(s), signaling potential stamina limits.`);
  }
  if (riskFlags && riskFlags.length > 0) {
    concerns.push(riskFlags[0].message || 'Form or range-of-motion plateau observed.');
  }

  recommendations.push('Maintain consistent pacing and prioritize controlled joint alignment during peak exertion.');
  if (concerns.length > 0) {
    recommendations.push('Review recurring posture alerts with your physical therapist during the next follow-up.');
  }
  if (sessionCount < 3) {
    recommendations.push('Increase weekly session frequency to establish reliable clinical baseline metrics.');
  }

  const headline = accuracy >= 80 ? 'Positive Rehabilitation Progress' : 'Steady Functional Practice';
  let overview = `The patient completed ${sessionCount} sessions totaling ${totalReps} repetitions with an overall accuracy of ${accuracy}%. `;
  if (trendDirection === 'improving') {
    overview += 'Movement consistency improved over the monitoring period. ';
  } else if (trendDirection === 'declining') {
    overview += 'Form consistency showed some decline in recent sessions. ';
  }
  if (sessionCount < 3) {
    overview += 'Note: fewer than 3 sessions were logged in this timeframe, which limits trend analysis confidence.';
  } else {
    overview += 'Overall engagement remains constructive, with targeted opportunities to refine exercise technique.';
  }

  return {
    headline: sanitizePdfText(headline).slice(0, 100),
    overview: sanitizePdfText(overview).slice(0, 600),
    highlights: highlights.slice(0, 3).map((h) => sanitizePdfText(h).slice(0, 150)),
    concerns: concerns.slice(0, 3).map((c) => sanitizePdfText(c).slice(0, 150)),
    recommendations: recommendations.slice(0, 3).map((r) => sanitizePdfText(r).slice(0, 150)),
    source: 'rule-based',
  };
}

async function generateReportSummary({ patient, days, sessions = [], programs = [], risk = null }) {
  const digest = buildDigest({ days, sessions, programs, risk });

  // 1. Zero sessions -> immediate rule-based (never call Gemini)
  if (digest.sessionCount === 0) {
    return buildRuleBasedSummary(digest);
  }

  // 2. Check cloud-AI consent and API key
  const hasConsent = patient && patient.consent && patient.consent.cloudAi === true;
  const hasKey = !!process.env.GEMINI_API_KEY && !!genAI;

  if (!hasConsent || !hasKey) {
    return buildRuleBasedSummary(digest);
  }

  // 3. Prepare Prompt for Gemini (NO patient name, email, or frames)
  const prompt = `You are a clinical AI physiotherapy assistant analyzing rehabilitation metric data for a progress report.
Analyze the following objective session data and provide an executive clinical summary.

Data:
- Period: last ${digest.days} days
- Sessions logged: ${digest.sessionCount}
- Total repetitions: ${digest.totalReps} (Accuracy: ${digest.accuracy}%)
- Avg movement quality score: ${digest.avgQuality != null ? digest.avgQuality : 'N/A'}/100
- Avg ROM score: ${digest.avgRom != null ? digest.avgRom : 'N/A'}/100
- Per-exercise accuracy: ${JSON.stringify(digest.exerciseAccuracy)}
- Trend direction (first half vs second half): ${digest.trendDirection}
- Top form issues: ${digest.topIssues.join('; ') || 'None'}
- Sessions with detected fatigue: ${digest.fatigueSessions}
- Active program: ${digest.activeProgram ? digest.activeProgram.name : 'None'}
- Clinical risk flags: ${digest.riskFlags.map((f) => f.message).join('; ') || 'None'}

Requirements:
1. Write in neutral, professional third person ("The patient...").
2. Do NOT diagnose medical conditions or prescribe medications.
3. Overview must be concise, objective, and <= 120 words.
4. If fewer than 3 sessions were logged, explicitly note this limitation on trend reliability.
5. Provide up to 3 highlights, up to 3 areas of concern, and up to 3 actionable recommendations.
6. Return STRICTLY a JSON object with this format:
{
  "headline": string,
  "overview": string,
  "highlights": string[],
  "concerns": string[],
  "recommendations": string[]
}`;

  for (const modelName of MODEL_NAMES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const apiCall = model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      // 8s timeout via Promise.race
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini summary timeout')), 8000)
      );

      const response = await Promise.race([apiCall, timeoutPromise]);
      const text = response.response.text();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found in response');

      const parsed = JSON.parse(match[0]);
      if (!parsed.headline || !parsed.overview) throw new Error('Missing required fields');

      return {
        headline: sanitizePdfText(String(parsed.headline)).slice(0, 100),
        overview: sanitizePdfText(String(parsed.overview)).slice(0, 600),
        highlights: Array.isArray(parsed.highlights)
          ? parsed.highlights.slice(0, 3).map((h) => sanitizePdfText(String(h)).slice(0, 150))
          : [],
        concerns: Array.isArray(parsed.concerns)
          ? parsed.concerns.slice(0, 3).map((c) => sanitizePdfText(String(c)).slice(0, 150))
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.slice(0, 3).map((r) => sanitizePdfText(String(r)).slice(0, 150))
          : [],
        source: 'gemini',
      };
    } catch (err) {
      console.warn(`[ReportSummary] Model ${modelName} error:`, err.message);
    }
  }

  return buildRuleBasedSummary(digest);
}

module.exports = {
  generateReportSummary,
  buildRuleBasedSummary,
  buildDigest,
  sanitizePdfText,
};
