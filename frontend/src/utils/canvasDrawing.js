/**
 * Canvas drawing utilities for rendering the pose skeleton overlay.
 * Draws landmarks as glowing dots and connections as smooth lines.
 */

import { POSE_CONNECTIONS } from './landmarkUtils';

/**
 * Clear the canvas and draw the full skeleton.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks - Normalized landmarks (x,y in [0,1])
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Object} options - Drawing options
 */
export function drawSkeleton(ctx, landmarks, width, height, options = {}) {
  const {
    connectionColor = 'rgba(0, 230, 200, 0.6)',
    connectionWidth = 2.5,
    landmarkRadius = 4,
    highlightJoints = [],       // Array of landmark indices to highlight
    highlightColor = '#ffb347', // Amber for highlighted joints
    showConfidence = true,
  } = options;

  ctx.clearRect(0, 0, width, height);

  if (!landmarks || landmarks.length === 0) return;

  // Draw connections first (behind landmarks)
  drawConnections(ctx, landmarks, width, height, connectionColor, connectionWidth);

  // Draw landmarks
  drawLandmarks(ctx, landmarks, width, height, landmarkRadius, highlightJoints, highlightColor, showConfidence);
}

/**
 * Draw connection lines between landmark pairs.
 */
function drawConnections(ctx, landmarks, width, height, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
    const start = landmarks[startIdx];
    const end = landmarks[endIdx];

    if (!start || !end) continue;
    if ((start.visibility || 0) < 0.3 || (end.visibility || 0) < 0.3) continue;

    const sx = start.x * width;
    const sy = start.y * height;
    const ex = end.x * width;
    const ey = end.y * height;

    // Gradient opacity based on average visibility
    const avgVis = ((start.visibility || 0) + (end.visibility || 0)) / 2;
    ctx.globalAlpha = Math.max(0.2, avgVis);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

/**
 * Draw landmark dots with glow effects.
 */
function drawLandmarks(ctx, landmarks, width, height, radius, highlightJoints, highlightColor, showConfidence) {
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm || (lm.visibility || 0) < 0.3) continue;

    const x = lm.x * width;
    const y = lm.y * height;
    const isHighlighted = highlightJoints.includes(i);

    // Glow effect
    if (isHighlighted) {
      ctx.shadowColor = highlightColor;
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowColor = 'rgba(0, 230, 200, 0.5)';
      ctx.shadowBlur = 6;
    }

    // Dot color based on visibility (if showConfidence) or highlight status
    let dotColor;
    if (isHighlighted) {
      dotColor = highlightColor;
    } else if (showConfidence) {
      const vis = lm.visibility || 0;
      if (vis > 0.8) dotColor = '#00e6c8';      // Teal — high confidence
      else if (vis > 0.5) dotColor = '#ffd166';  // Gold — medium
      else dotColor = '#ef476f';                  // Pink — low
    } else {
      dotColor = '#00e6c8';
    }

    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(x, y, isHighlighted ? radius * 1.5 : radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
  }
}

/**
 * Draw an angle arc visualization at a joint.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} joint - Joint landmark { x, y }
 * @param {Object} pointA - Landmark A { x, y }
 * @param {Object} pointB - Landmark B { x, y }
 * @param {number} angle - Computed angle in degrees
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function drawAngleArc(ctx, joint, pointA, pointB, angle, width, height) {
  if (!joint || !pointA || !pointB) return;

  const jx = joint.x * width;
  const jy = joint.y * height;
  const ax = pointA.x * width;
  const ay = pointA.y * height;
  const bx = pointB.x * width;
  const by = pointB.y * height;

  const angleA = Math.atan2(ay - jy, ax - jx);
  const angleB = Math.atan2(by - jy, bx - jx);

  const arcRadius = 30;

  // Draw arc
  ctx.strokeStyle = angle < 80 ? '#ef476f' : angle > 100 ? '#06d6a0' : '#ffd166';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(jx, jy, arcRadius, angleA, angleB, false);
  ctx.stroke();

  // Draw angle text
  const textAngle = (angleA + angleB) / 2;
  const tx = jx + (arcRadius + 15) * Math.cos(textAngle);
  const ty = jy + (arcRadius + 15) * Math.sin(textAngle);

  ctx.font = 'bold 13px Inter, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(angle)}°`, tx, ty);
}
