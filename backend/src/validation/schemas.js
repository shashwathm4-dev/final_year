/**
 * Zod schemas for every request body that writes data.
 * Unknown keys are stripped (Zod default), so extra fields never reach the database.
 */
const { z } = require('zod');

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/, 'Invalid id format');

// Raw base64 or a data URL (jpeg/png/webp). ~4 MB max.
const imageData = z
  .string()
  .min(20)
  .max(4_000_000)
  .regex(/^(data:image\/(jpeg|jpg|png|webp);base64,)?[A-Za-z0-9+/=]+$/, 'Invalid image data');

const score = z.number().min(0).max(100).nullish();
const count = z.number().int().min(0).max(10000);

const verifyRepSchema = z.object({
  patientFrame: imageData,
  referenceFrame: imageData.nullish(),
  exerciseId: id.optional(),
  sessionId: id.nullish(),
});

const sessionStartSchema = z.object({
  exerciseId: id.optional(),
});

const logRepSchema = z.object({
  sessionId: id,
  exerciseId: id.optional(),
  repNumber: count,
  timestamp: z.number().optional(),
  angles: z.array(z.number().finite()).max(10).nullish(),
  verdictSource: z.enum(['local', 'vlm', 'error']).optional(),
  correct: z.boolean().nullish(),
  issue: z.string().max(300).nullish(),
  severity: z.enum(['low', 'medium', 'high']).nullish(),
  tempoScore: score,
  smoothnessScore: score,
  romScore: score,
  qualityScore: score,
});

const sessionEndSchema = z.object({
  sessionId: id,
  totalReps: count.optional(),
  correctReps: count.optional(),
});

const addPatientSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
});

const profileSchema = z.object({
  role: z.enum(['doctor', 'patient']).optional(),
  fullName: z.string().trim().max(100).optional(),
});

const assignmentSchema = z.object({
  patientId: id,
  patientEmail: z.string().max(200).optional(),
  exerciseId: id,
  exerciseName: z.string().max(120).optional(),
  targetReps: z.coerce.number().int().min(1).max(100).optional(),
  targetSets: z.coerce.number().int().min(1).max(20).optional(),
  notes: z.string().max(500).optional(),
});

const angleNum = z.number().min(0).max(360);

const exerciseSchema = z.object({
  id: id.optional(),
  displayName: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  icon: z.string().max(8).optional(),
  joints: z.array(z.string().max(40)).min(1).max(6),
  landmarkIndices: z.record(z.string().max(40), z.number().int().min(0).max(32)).optional(),
  angleFunction: z.enum(['threePoint', 'lineToLine', 'rotation']).optional(),
  target_angle_range: z.tuple([angleNum, angleNum]),
  startAngleThreshold: angleNum.optional(),
  peakAngleThreshold: angleNum.optional(),
  returnAngleThreshold: angleNum.optional(),
  checkpoint_thresholds: z.array(angleNum).length(5).optional(),
  referenceCheckpoints: z.array(angleNum).length(5).optional(),
  note: z.string().max(300).optional(),
});

const consentSchema = z.object({
  accepted: z.boolean(),
  cloudAi: z.boolean(),
  version: z.string().max(20),
});

const deleteAccountSchema = z.object({
  confirm: z.literal('DELETE'),
});

const agentSnapshotSchema = z.object({
  t: z.number().optional(),
  angle: z.number().finite().optional(),
  state: z.string().max(50).optional(),
  repCount: z.number().int().min(0).max(10000).optional(),
  liveFlags: z.array(z.string().max(50)).max(10).optional(),
  trackingLost: z.boolean().optional(),
  fatigueLevel: z.string().max(50).optional(),
});

const agentEventSchema = z.object({
  type: z.string().max(50).optional(),
  rep: z.number().int().min(0).max(10000).optional(),
  correct: z.boolean().nullish(),
  issue: z.string().max(300).nullish(),
  compensations: z.array(z.string().max(50)).max(10).optional(),
  peakAngle: z.number().finite().optional(),
  qualityScore: score,
  romScore: score,
  durationMs: z.number().int().min(0).max(120000).optional(),
  at: z.number().optional(),
});

const agentLiveSchema = z.object({
  sessionId: id,
  exerciseId: id.optional(),
  snapshot: agentSnapshotSchema.optional(),
  events: z.array(agentEventSchema).max(50).optional(),
});

const agentChatSchema = z.object({
  message: z.string().trim().max(500),
  history: z
    .array(
      z.object({
        role: z.string().max(20),
        text: z.string().max(500).optional(),
        content: z.string().max(500).optional(),
      })
    )
    .max(10)
    .optional(),
  sessionId: id.nullish(),
});

const agentAssistSchema = z.object({
  reason: z.enum(['repeated_issue', 'fatigue', 'tracking', 'stalled']).optional(),
  issue: z.string().max(200).optional(),
  count: z.number().int().min(0).max(100).optional(),
  sessionId: id.nullish(),
});

module.exports = {
  verifyRepSchema,
  sessionStartSchema,
  logRepSchema,
  sessionEndSchema,
  addPatientSchema,
  profileSchema,
  assignmentSchema,
  exerciseSchema,
  consentSchema,
  deleteAccountSchema,
  agentLiveSchema,
  agentChatSchema,
  agentAssistSchema,
};

