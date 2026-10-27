/**
 * PDF progress report generator (pdfkit).
 * Contains NO camera frames — only numbers and text (privacy-safe).
 */
const PDFDocument = require('pdfkit');

const TEAL = '#0d9488';
const DARK = '#111827';
const GREY = '#6b7280';
const LIGHT = '#e5e7eb';

function pct(n, d) {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}
function avg(list) {
  const v = list.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function pretty(id) {
  return String(id || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {Object} data
 *  - patient {fullName,email}
 *  - doctorName, clinicName
 *  - days (range length)
 *  - sessions [{ startedAt, exerciseId, totalReps, correctReps, reps:[...] }]
 *  - programs [patientProgram]
 * @returns {PDFDocument} (already piped by caller)
 */
function buildReport(data) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  const ensureSpace = (needed) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
  };

  // ---------- Header ----------
  doc.rect(0, 0, doc.page.width, 70).fill(TEAL);
  doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
    .text('Physiotherapy Progress Report', left, 22);
  doc.fontSize(10).font('Helvetica')
    .text(data.clinicName || 'AI Physiotherapy Assistant', left, 48);
  doc.fillColor(DARK);
  doc.y = 90;

  // ---------- Patient block ----------
  doc.font('Helvetica-Bold').fontSize(12).text('Patient', left, doc.y);
  doc.font('Helvetica').fontSize(10).fillColor(GREY)
    .text(`Name: ${data.patient.fullName || '-'}`)
    .text(`Email: ${data.patient.email || '-'}`)
    .text(`Treating doctor: ${data.doctorName || '-'}`)
    .text(`Report period: last ${data.days} days (generated ${fmtDate(new Date().toISOString())})`);
  doc.moveDown(1);

  // ---------- Summary ----------
  const sessions = data.sessions;
  const totalReps = sessions.reduce((a, s) => a + (s.totalReps || 0), 0);
  const correctReps = sessions.reduce((a, s) => a + (s.correctReps || 0), 0);
  const allReps = sessions.flatMap((s) => s.reps || []);
  const avgQuality = avg(allReps.map((r) => r.qualityScore));
  const avgRom = avg(allReps.map((r) => r.romScore));
  const aiSkipped = allReps.filter((r) => r.verdictSource === 'error').length;

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text('Summary', left, doc.y);
  doc.moveDown(0.4);
  const boxes = [
    ['Sessions', String(sessions.length)],
    ['Total reps', String(totalReps)],
    ['Accuracy', `${pct(correctReps, totalReps)}%`],
    ['Avg quality', avgQuality != null ? `${avgQuality}/100` : 'n/a'],
    ['Avg ROM score', avgRom != null ? `${avgRom}/100` : 'n/a'],
  ];
  const boxW = width / boxes.length;
  const boxTop = doc.y;
  boxes.forEach(([label, value], i) => {
    const x = left + i * boxW;
    doc.rect(x + 2, boxTop, boxW - 4, 46).fill('#f0fdfa');
    doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(15)
      .text(value, x + 2, boxTop + 8, { width: boxW - 4, align: 'center' });
    doc.fillColor(GREY).font('Helvetica').fontSize(8)
      .text(label, x + 2, boxTop + 30, { width: boxW - 4, align: 'center' });
  });
  doc.y = boxTop + 60;
  if (aiSkipped > 0) {
    doc.fillColor(GREY).font('Helvetica-Oblique').fontSize(8)
      .text(`Note: ${aiSkipped} rep(s) were judged by on-device checks only because AI verification was unavailable.`, left, doc.y);
    doc.moveDown(0.5);
  }

  // ---------- AI-Generated Clinical Summary (Part B) ----------
  if (data.aiSummary) {
    const ai = data.aiSummary;
    ensureSpace(120);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text('AI-generated summary', left, doc.y);
    doc.moveDown(0.3);

    if (ai.headline) {
      doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(10).text(ai.headline, left, doc.y);
      doc.moveDown(0.2);
    }

    if (ai.overview) {
      doc.fillColor(DARK).font('Helvetica').fontSize(9).text(ai.overview, left, doc.y, { width, lineGap: 2 });
      doc.moveDown(0.4);
    }

    if (Array.isArray(ai.highlights) && ai.highlights.length > 0) {
      ensureSpace(40);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text('Highlights:', left, doc.y);
      ai.highlights.forEach((h) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(`- ${h}`, left + 10, doc.y + 2, { width: width - 10 });
      });
      doc.moveDown(0.3);
    }

    if (Array.isArray(ai.concerns) && ai.concerns.length > 0) {
      ensureSpace(40);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text('Areas of concern:', left, doc.y);
      ai.concerns.forEach((c) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(`- ${c}`, left + 10, doc.y + 2, { width: width - 10 });
      });
      doc.moveDown(0.3);
    }

    if (Array.isArray(ai.recommendations) && ai.recommendations.length > 0) {
      ensureSpace(40);
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9).text('Recommendations:', left, doc.y);
      ai.recommendations.forEach((r) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(DARK).text(`- ${r}`, left + 10, doc.y + 2, { width: width - 10 });
      });
      doc.moveDown(0.3);
    }

    const sourceLabel = ai.source === 'gemini' ? 'Gemini AI' : 'rule-based clinical heuristics';
    doc.fillColor(GREY).font('Helvetica-Oblique').fontSize(7.5)
      .text(`AI-generated from session data — review with your clinician (${sourceLabel})`, left, doc.y + 2);
    doc.moveDown(0.8);
  }

  // ---------- Per-exercise table ----------
  ensureSpace(80);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text('Performance by exercise', left, doc.y);
  doc.moveDown(0.4);

  const byExercise = {};
  sessions.forEach((s) => {
    const k = s.exerciseId || 'unknown';
    if (!byExercise[k]) byExercise[k] = { sessions: 0, total: 0, correct: 0, reps: [] };
    byExercise[k].sessions += 1;
    byExercise[k].total += s.totalReps || 0;
    byExercise[k].correct += s.correctReps || 0;
    byExercise[k].reps.push(...(s.reps || []));
  });

  const exCols = [
    { label: 'Exercise', w: 170 },
    { label: 'Sessions', w: 60 },
    { label: 'Reps', w: 60 },
    { label: 'Accuracy', w: 70 },
    { label: 'Avg quality', w: 75 },
    { label: 'Avg ROM', w: width - 435 },
  ];
  const drawRow = (cols, values, bold = false, shade = false) => {
    ensureSpace(20);
    const y = doc.y;
    if (shade) doc.rect(left, y - 2, width, 16).fill('#f9fafb');
    doc.fillColor(DARK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    let x = left;
    cols.forEach((c, i) => {
      doc.text(String(values[i]), x + 3, y, { width: c.w - 6, lineBreak: false, ellipsis: true });
      x += c.w;
    });
    doc.y = y + 16;
    doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).strokeColor(LIGHT).lineWidth(0.5).stroke();
  };
  drawRow(exCols, exCols.map((c) => c.label), true, true);
  const exEntries = Object.entries(byExercise);
  if (exEntries.length === 0) {
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text('No sessions in this period.', left + 3, doc.y);
    doc.moveDown(0.5);
  }
  exEntries.forEach(([id, v]) => {
    const q = avg(v.reps.map((r) => r.qualityScore));
    const r = avg(v.reps.map((x) => x.romScore));
    drawRow(exCols, [pretty(id), v.sessions, v.total, `${pct(v.correct, v.total)}%`, q != null ? q : 'n/a', r != null ? r : 'n/a']);
  });
  doc.moveDown(1);

  // ---------- Program status ----------
  const activeProgram = (data.programs || []).find((p) => p.status === 'active');
  if (activeProgram) {
    ensureSpace(100);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text('Active exercise program', left, doc.y);
    doc.font('Helvetica').fontSize(10).fillColor(GREY)
      .text(`${activeProgram.programName} (since ${fmtDate(activeProgram.startDate)})`, left, doc.y + 2);
    doc.moveDown(0.4);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    activeProgram.items.forEach((it) => {
      ensureSpace(16);
      const days = it.daysOfWeek && it.daysOfWeek.length ? it.daysOfWeek.map((d) => dayNames[d]).join(', ') : 'any day';
      doc.fillColor(DARK).font('Helvetica').fontSize(9)
        .text(`- ${it.exerciseName}: ${it.targetSets} sets x ${it.targetReps} reps (${days}); good-session streak ${it.goodStreak || 0}/${activeProgram.progression?.goodSessionsRequired ?? 3}`, left, doc.y);
    });
    if (activeProgram.log && activeProgram.log.length) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).text('Target progression history', left, doc.y);
      activeProgram.log.slice(-6).forEach((l) => {
        ensureSpace(14);
        doc.font('Helvetica').fontSize(9).fillColor(DARK)
          .text(`${fmtDate(l.at)} - ${l.exerciseName}: ${l.from.sets}x${l.from.reps} -> ${l.to.sets}x${l.to.reps}`, left, doc.y);
      });
    }
    doc.moveDown(1);
  }

  // ---------- Session log ----------
  ensureSpace(80);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(12).text('Session log', left, doc.y);
  doc.moveDown(0.4);
  const logCols = [
    { label: 'Date', w: 90 },
    { label: 'Exercise', w: 190 },
    { label: 'Reps', w: 60 },
    { label: 'Correct', w: 70 },
    { label: 'Accuracy', w: width - 410 },
  ];
  drawRow(logCols, logCols.map((c) => c.label), true, true);
  sessions.forEach((s, i) => {
    drawRow(
      logCols,
      [fmtDate(s.startedAt), pretty(s.exerciseId), s.totalReps || 0, s.correctReps || 0, `${pct(s.correctReps || 0, s.totalReps || 0)}%`],
      false,
      i % 2 === 1
    );
  });

  // ---------- Footer on every page ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(GREY).font('Helvetica').fontSize(7.5)
      .text(
        'Generated by AI Physiotherapy Assistant. Rep counts and form scores are computer-vision estimates and support, not replace, clinical judgement.',
        left, doc.page.height - 38, { width, align: 'center' }
      )
      .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 26, { width, align: 'center' });
  }

  return doc;
}

module.exports = { buildReport };
