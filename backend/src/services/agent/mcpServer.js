/**
 * mcpServer.js
 * In-process Model Context Protocol (MCP) server for live physiotherapy coaching.
 * - Uses @modelcontextprotocol/sdk Server & InMemoryTransport.
 * - Connects via linked pair (in-memory, no open network port).
 * - Read-only tools; caller identity passed in per-request context, never from tool arguments.
 * - Role-based authorization: patients can only query self; doctors can pass patientId if canDoctorAccessPatient(...).
 * - Produces compact JSON responses (<2KB).
 */
const path = require('path');

// Resolve MCP SDK CJS paths directly to avoid Node exports-map double-resolution.
const SDK_CJS = path.join(__dirname, '..', '..', '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'cjs');
const { Server } = require(path.join(SDK_CJS, 'server', 'index.js'));
const { Client } = require(path.join(SDK_CJS, 'client', 'index.js'));
const { InMemoryTransport } = require(path.join(SDK_CJS, 'inMemory.js'));
const { ListToolsRequestSchema, CallToolRequestSchema } = require(path.join(SDK_CJS, 'types.js'));


const { getUserLiveStore } = require('./liveStore');
const { getExerciseById, getSessionsByPatient, getSession } = require('../firestore');
const { summarizeSession } = require('../sessionMetrics');
const { computeTrends } = require('../analytics');
const { analyzeTrend } = require('../riskAnalysis');
const { canDoctorAccessPatient } = require('../access');

const TOOLS = [
  {
    name: 'get_live_state',
    description: 'Get live exercise state: current angle, phase/state, rep count, live posture flags, tracking status, fatigue level, and last 10s angle series.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_recent_reps',
    description: 'Get recent repetitions with correct status, issues, quality/ROM scores, compensations, and peak angles.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max reps to return (up to 20, default 10)' },
      },
    },
  },
  {
    name: 'get_exercise_config',
    description: 'Get target angle range, checkpoints, and posture cues for the current or specified exercise.',
    inputSchema: {
      type: 'object',
      properties: {
        exerciseId: { type: 'string', description: 'Optional exercise ID (defaults to current exercise)' },
      },
    },
  },
  {
    name: 'get_session_summary',
    description: 'Get aggregated summary metrics (accuracy, avg quality, avg ROM, fatigue) of the current live session so far.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_patient_progress',
    description: 'Get historical progress and ROM trends over recent days.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Lookback window in days (max 90, default 30)' },
        patientId: { type: 'string', description: 'Doctor-only: target patient ID' },
      },
    },
  },
  {
    name: 'get_risk_flags',
    description: 'Get injury risk or plateau detection flags from multi-session trend analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        patientId: { type: 'string', description: 'Doctor-only: target patient ID' },
      },
    },
  },
  {
    name: 'get_previous_session_comparison',
    description: 'Compare current session performance against the most recent completed session for the same exercise.',
    inputSchema: { type: 'object', properties: {} },
  },
];

/**
 * Creates an in-process MCP server and connected client pair bound to a specific request context.
 * @param {Object} context { user: { uid, role }, effectivePatientId?: string }
 */
async function createMcpSession(context) {
  const { user } = context || {};
  if (!user || !user.uid) {
    throw new Error('Authentication required for MCP server');
  }

  const server = new Server(
    { name: 'physio-coach-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Helper to determine target patient ID
  async function resolveTargetPatient(paramPatientId) {
    if (!paramPatientId || paramPatientId === user.uid) {
      return user.uid;
    }
    if (user.role === 'doctor') {
      const allowed = await canDoctorAccessPatient(user.uid, paramPatientId);
      if (allowed) return paramPatientId;
      throw new Error('Forbidden: doctor cannot access this patient');
    }
    // Patients can NEVER access another patient's data
    return user.uid;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const targetUid = await resolveTargetPatient(args.patientId);
    const store = getUserLiveStore(targetUid);

    switch (name) {
      case 'get_live_state': {
        if (!store || !store.snapshots.length) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ active: false, message: 'No live session data available' }),
              },
            ],
          };
        }
        const last = store.snapshots[store.snapshots.length - 1];
        const recentSnapshots = store.snapshots.slice(-10);
        const angleSeries = recentSnapshots.map((s) => ({
          t: Math.round(s.t / 1000),
          a: s.angle,
        }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                active: true,
                exerciseId: store.meta.exerciseId,
                currentAngle: last.angle,
                state: last.state,
                repCount: last.repCount,
                liveFlags: last.liveFlags,
                trackingLost: last.trackingLost,
                fatigue: last.fatigueLevel,
                last10sAngleSeries: angleSeries,
              }),
            },
          ],
        };
      }

      case 'get_recent_reps': {
        const limit = Math.min(20, Math.max(1, Number(args.limit) || 10));
        const repEvents = (store?.events || []).filter((e) => e.type === 'rep');
        const recent = repEvents.slice(-limit).map((r) => ({
          rep: r.rep,
          correct: r.correct,
          issue: r.issue,
          peakAngle: r.peakAngle,
          quality: r.qualityScore,
          rom: r.romScore,
          compensations: r.compensations,
          durationMs: r.durationMs,
        }));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: recent.length, reps: recent }),
            },
          ],
        };
      }

      case 'get_exercise_config': {
        const exId = args.exerciseId || store?.meta.exerciseId || 'squat';
        const ex = await getExerciseById(exId);
        if (!ex) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `Exercise not found: ${exId}` }) }],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: ex.id,
                name: ex.name,
                target_angle_range: ex.target_angle_range,
                cameraView: ex.cameraView,
                common_faults: (ex.common_faults || []).slice(0, 3),
              }),
            },
          ],
        };
      }

      case 'get_session_summary': {
        const repEvents = (store?.events || []).filter((e) => e.type === 'rep');
        const syntheticSession = { reps: repEvents };
        const summary = summarizeSession(syntheticSession);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                exerciseId: store?.meta?.exerciseId || 'n/a',
                repCount: summary.repCount,
                correctReps: summary.correctReps,
                accuracy: summary.accuracy,
                avgQuality: summary.avgQuality,
                avgPeakAngle: summary.avgPeakAngle,
                fatigue: summary.fatigue.level,
              }),
            },
          ],
        };
      }

      case 'get_patient_progress': {
        const days = Math.min(90, Math.max(1, Number(args.days) || 30));
        const since = Date.now() - days * 24 * 3600 * 1000;
        const allSessions = await getSessionsByPatient(targetUid);
        const filtered = allSessions.filter((s) => new Date(s.startedAt || 0).getTime() >= since);
        const trends = computeTrends(filtered);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                periodDays: days,
                completedSessions: filtered.length,
                exercises: (trends.exercises || []).map((e) => ({
                  exerciseId: e.exerciseId,
                  romChange: e.romChange,
                  direction: e.direction,
                  latestAccuracy: e.points[e.points.length - 1]?.accuracy ?? null,
                })),
              }),
            },
          ],
        };
      }

      case 'get_risk_flags': {
        const exId = store?.meta.exerciseId || 'squat';
        const ex = await getExerciseById(exId);
        const allSessions = await getSessionsByPatient(targetUid);
        const sameEx = allSessions.filter((s) => s.exerciseId === exId && s.status === 'completed');
        const risk = analyzeTrend(sameEx, ex || {});
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                riskLevel: risk.riskLevel,
                flags: (risk.flags || []).map((f) => ({ code: f.code, message: f.message })),
              }),
            },
          ],
        };
      }

      case 'get_previous_session_comparison': {
        const exId = store?.meta.exerciseId;
        if (!exId) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ message: 'No active exercise in progress' }) }],
          };
        }
        const allSessions = await getSessionsByPatient(targetUid);
        const completedSame = allSessions
          .filter((s) => s.exerciseId === exId && s.status === 'completed')
          .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

        if (!completedSame.length) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ message: 'No previous completed session for comparison' }) }],
          };
        }
        const prev = completedSame[0];
        const prevFull = (await getSession(prev.sessionId)) || prev;
        const prevSummary = prevFull.summary || summarizeSession(prevFull);

        const currentReps = (store?.events || []).filter((e) => e.type === 'rep');
        const currSummary = summarizeSession({ reps: currentReps });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                exerciseId: exId,
                previousSessionDate: prev.startedAt,
                prevAccuracy: prevSummary.accuracy,
                currAccuracy: currSummary.accuracy,
                accuracyDelta: currSummary.accuracy - prevSummary.accuracy,
                prevAvgQuality: prevSummary.avgQuality,
                currAvgQuality: currSummary.avgQuality,
                prevAvgPeak: prevSummary.avgPeakAngle,
                currAvgPeak: currSummary.avgPeakAngle,
              }),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'coach-agent-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, server };
}

module.exports = {
  createMcpSession,
  TOOLS,
};
