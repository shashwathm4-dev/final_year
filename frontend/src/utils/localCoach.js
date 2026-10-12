/**
 * Offline rule-based coaching generator (mirror of backend ruleBasedSummary)
 */
export function localCoach(repHistory = [], fatigue = null) {
  const total = repHistory.length;
  const correctCount = repHistory.filter((r) => r.correct === true).length;
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const avgQuality = total > 0
    ? Math.round(repHistory.reduce((s, r) => s + (r.qualityScore || 0), 0) / total)
    : 0;

  const wins = [];
  const focusAreas = [];

  if (accuracy >= 80) wins.push(`High accuracy: ${accuracy}% of reps performed with correct form`);
  else if (accuracy >= 50) wins.push(`Consistent effort across ${total} reps completed`);
  else focusAreas.push(`Form accuracy was ${accuracy}%. Focus on steady, controlled repetitions.`);

  if (avgQuality >= 80) wins.push(`Smooth, well-controlled movement pacing`);
  else if (avgQuality < 60) focusAreas.push(`Move more smoothly through each repetition phase`);

  const issues = repHistory.filter((r) => !r.correct && r.issue).map((r) => r.issue);
  if (issues.length > 0) {
    const topIssue = issues[0];
    focusAreas.push(topIssue);
  }

  if (fatigue && (fatigue.level === 'moderate' || fatigue.level === 'high')) {
    focusAreas.push(`Fatigue detected towards the end — allow sufficient rest between sets`);
  }

  let headline = 'Good workout completion!';
  if (accuracy >= 85) headline = 'Outstanding form and control today!';
  else if (accuracy < 50) headline = 'Keep practicing with focus on form';

  let nextStep = 'Take a short break, hydrate, and maintain this form in your next session.';
  if (fatigue?.level === 'high') {
    nextStep = 'Rest well before your next session to avoid muscle compensation.';
  }

  return {
    headline,
    summary: `You completed ${total} repetitions with an average form quality of ${avgQuality}% and ${accuracy}% accuracy. Notice the focus points below to keep improving.`,
    wins: wins.slice(0, 3),
    focusAreas: focusAreas.slice(0, 3),
    nextStep,
    safetyNote: 'Screening aid only. If you experience pain or discomfort, stop and consult your physiotherapist.',
    source: 'offline',
  };
}
