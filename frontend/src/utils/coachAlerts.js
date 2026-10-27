/**
 * coachAlerts.js
 * Pure deterministic alert engine (Instant Layer, <100ms, no LLM).
 *
 * createAlertEngine(exerciseConfig) -> { ingest(item), reset() }
 *
 * Ingests:
 * - Rep events: { type:'rep', correct, issue, peakAngle, compensations, quality, durationMs, repNumber }
 * - Snapshots: { type:'snapshot', angle, state, liveFlags, trackingLost, fatigueLevel }
 * - Status events: { type:'hold_state'|'tracking'|'fatigue'|'stalled' }
 *
 * Returns: alert[]
 * Alert shape: { id, key, severity: 'info'|'success'|'warn'|'error', title, detail, fix, at }
 */

import { COMPENSATION_LABELS, COMPENSATION_CUES } from './compensation';

const DEFAULT_COOLDOWNS = {
  wrong_rep: 2500,
  compensation: 4000,
  over_extension: 3000,
  too_fast: 3500,
  tracking_lost: 4000,
  tracking_restored: 4000,
  hold_paused: 3000,
  fatigue_warn: 8000,
  repeated_issue: 10000,
  stalled: 10000,
  success: 2000,
};

export function createAlertEngine(exerciseConfig = {}) {
  const [tMin, tMax] = exerciseConfig.target_angle_range || [80, 100];
  const lastFiredAt = new Map();

  let streak = 0;
  let lastIssue = null;
  let repeatedIssueCount = 0;
  let prevTrackingLost = false;
  let idCounter = 1;

  function canFire(key, cooldownMs) {
    const now = Date.now();
    const last = lastFiredAt.get(key) || 0;
    if (now - last >= cooldownMs) {
      lastFiredAt.set(key, now);
      return true;
    }
    return false;
  }

  function makeAlert(key, severity, title, detail, fix) {
    return {
      id: `alert-${Date.now()}-${idCounter++}`,
      key,
      severity, // 'info' | 'success' | 'warn' | 'error'
      title,
      detail,
      fix,
      at: Date.now(),
    };
  }

  function ingest(item) {
    if (!item) return [];
    const alerts = [];
    const type = item.type || (item.repNumber ? 'rep' : 'snapshot');

    // 1. REP COMPLETED EVENT
    if (type === 'rep') {
      const {
        correct,
        issue,
        peakAngle,
        compensations = [],
        quality = {},
        durationMs,
        repNumber,
        isHoldRep,
      } = item;

      // Track Good Streaks
      if (correct === true) {
        streak++;
        repeatedIssueCount = 0;
        lastIssue = null;

        if (streak === 3 || streak === 5 || streak % 5 === 0) {
          if (canFire('success', DEFAULT_COOLDOWNS.success)) {
            alerts.push(
              makeAlert(
                'success',
                'success',
                `Great Streak!`,
                `${streak} good reps in a row with solid form.`,
                'Keep this steady rhythm and stay focused.'
              )
            );
          }
        }
      } else if (correct === false) {
        streak = 0;

        // Check repeated issue (3-in-a-row)
        const currentIssueKey = issue || (peakAngle != null && peakAngle < tMin ? 'rom_short' : 'form_deviation');
        if (lastIssue === currentIssueKey) {
          repeatedIssueCount++;
        } else {
          lastIssue = currentIssueKey;
          repeatedIssueCount = 1;
        }

        if (repeatedIssueCount >= 3) {
          if (canFire('repeated_issue', DEFAULT_COOLDOWNS.repeated_issue)) {
            alerts.push(
              makeAlert(
                'repeated_issue',
                'error',
                'Repeated Mistake',
                `"${issue || 'Range of motion'}" occurred 3 times in a row.`,
                'Pause briefly, re-align your posture, and consult the AI coach sidebar.'
              )
            );
          }
        }

        // Over-extension vs under-extension
        if (typeof peakAngle === 'number') {
          if (peakAngle > tMax + 15) {
            if (canFire('over_extension', DEFAULT_COOLDOWNS.over_extension)) {
              alerts.push(
                makeAlert(
                  'over_extension',
                  'warn',
                  'Over-extension',
                  `Peak reached ${Math.round(peakAngle)}° (target is ${tMin}–${tMax}°).`,
                  'Stop right at the top target mark without pushing past it.'
                )
              );
            }
          } else if (peakAngle < tMin) {
            if (canFire('wrong_rep', DEFAULT_COOLDOWNS.wrong_rep)) {
              alerts.push(
                makeAlert(
                  'wrong_rep',
                  'warn',
                  `Peak ${Math.round(peakAngle)}° — Target ${tMin}–${tMax}°`,
                  issue || 'Movement stopped before reaching the target range.',
                  isHoldRep ? 'Try to hold steady in position' : 'Raise your arm or leg a little higher'
                )
              );
            }
          } else if (canFire('wrong_rep', DEFAULT_COOLDOWNS.wrong_rep)) {
            alerts.push(
              makeAlert(
                'wrong_rep',
                'warn',
                'Form Deviation',
                issue || 'Movement did not match reference checkpoint alignment.',
                'Move smoothly and keep your joints aligned.'
              )
            );
          }
        } else if (canFire('wrong_rep', DEFAULT_COOLDOWNS.wrong_rep)) {
          alerts.push(
            makeAlert(
              'wrong_rep',
              'warn',
              'Form Check',
              issue || 'Movement consistency deviation detected.',
              'Reset posture and focus on steady execution.'
            )
          );
        }

        // Tempo / too fast check
        if (
          durationMs &&
          durationMs < 1200 &&
          canFire('too_fast', DEFAULT_COOLDOWNS.too_fast)
        ) {
          alerts.push(
            makeAlert(
              'too_fast',
              'warn',
              'Too Fast',
              `Rep took ${(durationMs / 1000).toFixed(1)}s. Fast execution reduces muscle activation.`,
              'Slow down and maintain a controlled 2-second lift and lower.'
            )
          );
        }

        // Compensations on rep
        if (compensations.length > 0 && canFire('compensation', DEFAULT_COOLDOWNS.compensation)) {
          const first = compensations[0];
          const label = COMPENSATION_LABELS[first] || first;
          const cue = COMPENSATION_CUES[first] || 'Keep your posture aligned';
          alerts.push(
            makeAlert(
              'compensation',
              'warn',
              `Compensation: ${label}`,
              `Detected ${label} during peak movement.`,
              cue
            )
          );
        }
      }
    }

    // 2. LIVE SNAPSHOT / TRACKING / FATIGUE
    if (type === 'snapshot' || type === 'tracking' || type === 'fatigue' || type === 'hold_state' || type === 'stalled') {
      // Tracking lost / restored
      if (typeof item.trackingLost === 'boolean') {
        if (item.trackingLost && !prevTrackingLost) {
          if (canFire('tracking_lost', DEFAULT_COOLDOWNS.tracking_lost)) {
            alerts.push(
              makeAlert(
                'tracking_lost',
                'warn',
                'Camera Tracking Lost',
                'The camera lost visibility of your body landmarks.',
                'Step back into the camera frame and ensure good lighting.'
              )
            );
          }
        } else if (!item.trackingLost && prevTrackingLost) {
          if (canFire('tracking_restored', DEFAULT_COOLDOWNS.tracking_restored)) {
            alerts.push(
              makeAlert(
                'tracking_restored',
                'info',
                'Tracking Restored',
                'Pose landmarks detected successfully.',
                'Continue your exercise session.'
              )
            );
          }
        }
        prevTrackingLost = item.trackingLost;
      }

      // Live compensations from snapshot liveFlags
      if (Array.isArray(item.liveFlags) && item.liveFlags.length > 0) {
        if (canFire('compensation', DEFAULT_COOLDOWNS.compensation)) {
          const first = item.liveFlags[0];
          const label = COMPENSATION_LABELS[first] || first;
          const cue = COMPENSATION_CUES[first] || 'Re-center your posture';
          alerts.push(
            makeAlert(
              'compensation',
              'warn',
              `Posture Warning`,
              label,
              cue
            )
          );
        }
      }

      // Hold paused
      if (item.state === 'PAUSED' || item.holdState === 'PAUSED') {
        if (canFire('hold_paused', DEFAULT_COOLDOWNS.hold_paused)) {
          alerts.push(
            makeAlert(
              'hold_paused',
              'info',
              'Hold Position Broken',
              'Joint moved out of the target hold threshold.',
              'Get back into the target position to resume timer.'
            )
          );
        }
      }

      // High fatigue
      if (item.fatigueLevel === 'high' || item.fatigue === 'high') {
        if (canFire('fatigue_warn', DEFAULT_COOLDOWNS.fatigue_warn)) {
          alerts.push(
            makeAlert(
              'fatigue_warn',
              'error',
              'High Fatigue Detected',
              'Movement tempo slowed down significantly and range of motion has dropped.',
              'Take a 30 to 60-second break before your next rep.'
            )
          );
        }
      }

      // Stalled nudge
      if (item.stalled === true) {
        if (canFire('stalled', DEFAULT_COOLDOWNS.stalled)) {
          alerts.push(
            makeAlert(
              'stalled',
              'info',
              'Ready for your next rep?',
              'No active movement detected for over 10 seconds.',
              'Whenever you are ready, begin your next repetition.'
            )
          );
        }
      }
    }

    return alerts;
  }

  function reset() {
    lastFiredAt.clear();
    streak = 0;
    lastIssue = null;
    repeatedIssueCount = 0;
    prevTrackingLost = false;
  }

  return { ingest, reset };
}
