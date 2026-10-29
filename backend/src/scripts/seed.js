/**
 * Seed realistic mock clinics, doctors, patients, and sessions.
 * Auto-detects any existing real Firebase user and promotes them to doctor role
 * so seeded patients, clinics, and exercises are immediately visible when logged in.
 *
 * IDEMPOTENT — safe to run multiple times; existing session data is preserved.
 */
const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.LOCAL_STORE_PATH || path.join(__dirname, '../../data/store.json');

function seedData() {
  let store = {
    users: {},
    sessions: {},
    exercises: {},
    assignedExercises: {},
    sessionComments: {},
    playback: {},
    personalization: {},
    models: {},
    programs: {},
    patientPrograms: {},
    clinics: {}
  };

  if (fs.existsSync(STORE_PATH)) {
    try {
      store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (e) {
      console.warn('[Seed] Could not read existing store, creating fresh.');
    }
  }

  // Ensure collections exist
  const collections = ['users', 'sessions', 'exercises', 'assignedExercises', 'sessionComments', 'playback', 'personalization', 'models', 'programs', 'patientPrograms', 'clinics'];
  for (const col of collections) {
    if (!store[col]) store[col] = {};
  }

  // --- Check if seed data already exists (idempotent guard) ---
  if (Object.keys(store.clinics).length >= 3 && Object.keys(store.assignedExercises).length >= 4) {
    console.log('[Seed] Data already seeded — skipping. Delete store.json to re-seed.');
    return;
  }

  const now = new Date();
  const pastDays = (d) => new Date(now.getTime() - d * 86400000).toISOString();

  // --- Find the REAL logged-in user (Firebase UID) ---
  // Any existing user whose UID is NOT a seed-prefixed ID is considered the real user.
  let realUserId = null;
  let realUserEmail = null;
  for (const [uid, user] of Object.entries(store.users)) {
    if (!uid.startsWith('doc_') && !uid.startsWith('pat_') && !uid.startsWith('pat_seed_')) {
      realUserId = uid;
      realUserEmail = user.email;
      break;
    }
  }

  // The primary doctor is the real logged-in user if present
  const primaryDoctorId = realUserId || 'doc_rahul_verma';
  const primaryDoctorEmail = realUserEmail || 'rahul@gmail.com';

  // Define Clinics
  const clinic1Id = 'clinic_asaara_ortho';
  const clinic2Id = 'clinic_apex_sports_rehab';
  const clinic3Id = 'clinic_carewave_pt';

  // --- DOCTOR DEFINITIONS ---
  const doctors = [
    {
      uid: primaryDoctorId,
      email: primaryDoctorEmail,
      fullName: 'Dr. Rahul Verma, PT',
      role: 'doctor',
      clinicId: clinic1Id,
      createdAt: pastDays(30),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_priya_sharma',
      email: 'priya.sharma@asaara.health',
      fullName: 'Dr. Priya Sharma, MPT (Neuro)',
      role: 'doctor',
      clinicId: clinic1Id,
      createdAt: pastDays(25),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_arun_kumar',
      email: 'arun.kumar@asaara.health',
      fullName: 'Dr. Arun Kumar, PT (Ortho)',
      role: 'doctor',
      clinicId: clinic1Id,
      createdAt: pastDays(20),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_marcus_vance',
      email: 'm.vance@apexrehab.com',
      fullName: 'Dr. Marcus Vance, DPT, OCS',
      role: 'doctor',
      clinicId: clinic2Id,
      createdAt: pastDays(45),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_elena_rostova',
      email: 'elena.r@apexrehab.com',
      fullName: 'Dr. Elena Rostova, PT (Sports)',
      role: 'doctor',
      clinicId: clinic2Id,
      createdAt: pastDays(40),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_david_chen',
      email: 'david.chen@apexrehab.com',
      fullName: 'Dr. David Chen, MPT',
      role: 'doctor',
      clinicId: clinic2Id,
      createdAt: pastDays(35),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_sarah_jenkins',
      email: 'sjenkins@carewavept.com',
      fullName: 'Dr. Sarah Jenkins, PT (Spine Specialist)',
      role: 'doctor',
      clinicId: clinic3Id,
      createdAt: pastDays(60),
      updatedAt: now.toISOString()
    },
    {
      uid: 'doc_kavita_nair',
      email: 'knair@carewavept.com',
      fullName: 'Dr. Kavita Nair, DPT',
      role: 'doctor',
      clinicId: clinic3Id,
      createdAt: pastDays(50),
      updatedAt: now.toISOString()
    }
  ];

  // --- PATIENTS DEFINITIONS ---
  const patients = [
    // Assigned to primary doctor (Clinic 1)
    {
      uid: 'pat_shashwath_m',
      email: 'shashwathm4@gmail.com',
      fullName: 'Shashwath M',
      role: 'patient',
      doctorId: primaryDoctorId,
      createdAt: pastDays(14),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_ananya_rao',
      email: 'ananya.rao@example.com',
      fullName: 'Ananya Rao',
      role: 'patient',
      doctorId: primaryDoctorId,
      createdAt: pastDays(10),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_vikram_singh',
      email: 'vikram.singh@example.com',
      fullName: 'Vikram Singh',
      role: 'patient',
      doctorId: primaryDoctorId,
      createdAt: pastDays(8),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_meera_iyer',
      email: 'meera.iyer@example.com',
      fullName: 'Meera Iyer',
      role: 'patient',
      doctorId: primaryDoctorId,
      createdAt: pastDays(6),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_sneha_patel',
      email: 'sneha.patel@example.com',
      fullName: 'Sneha Patel',
      role: 'patient',
      doctorId: 'doc_priya_sharma',
      createdAt: pastDays(12),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_karan_johal',
      email: 'karan.johal@example.com',
      fullName: 'Karan Johal',
      role: 'patient',
      doctorId: 'doc_priya_sharma',
      createdAt: pastDays(7),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_rohit_menon',
      email: 'rohit.menon@example.com',
      fullName: 'Rohit Menon',
      role: 'patient',
      doctorId: 'doc_arun_kumar',
      createdAt: pastDays(9),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_james_miller',
      email: 'jmiller@example.com',
      fullName: 'James Miller',
      role: 'patient',
      doctorId: 'doc_marcus_vance',
      createdAt: pastDays(20),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_olivia_taylor',
      email: 'olivia.t@example.com',
      fullName: 'Olivia Taylor',
      role: 'patient',
      doctorId: 'doc_marcus_vance',
      createdAt: pastDays(18),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_lucas_silva',
      email: 'lucas.silva@example.com',
      fullName: 'Lucas Silva',
      role: 'patient',
      doctorId: 'doc_elena_rostova',
      createdAt: pastDays(15),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_sophia_martinez',
      email: 'smartinez@example.com',
      fullName: 'Sophia Martinez',
      role: 'patient',
      doctorId: 'doc_sarah_jenkins',
      createdAt: pastDays(22),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_ethan_williams',
      email: 'ethan.w@example.com',
      fullName: 'Ethan Williams',
      role: 'patient',
      doctorId: 'doc_sarah_jenkins',
      createdAt: pastDays(19),
      updatedAt: now.toISOString()
    }
  ];

  // Store users — merge on top of any existing data so we don't lose fields
  for (const d of doctors) {
    store.users[d.uid] = { ...(store.users[d.uid] || {}), ...d };
  }
  for (const pat of patients) {
    store.users[pat.uid] = { ...(store.users[pat.uid] || {}), ...pat };
  }

  // --- CLINIC DEFINITIONS ---
  const clinic1Members = [primaryDoctorId, 'doc_priya_sharma', 'doc_arun_kumar'];
  const clinic2Members = ['doc_marcus_vance', 'doc_elena_rostova', 'doc_david_chen'];
  const clinic3Members = ['doc_sarah_jenkins', 'doc_kavita_nair'];

  store.clinics[clinic1Id] = {
    id: clinic1Id,
    name: 'Asaara Orthopedic & Rehab Institute',
    adminId: primaryDoctorId,
    inviteCode: store.clinics[clinic1Id]?.inviteCode || 'ASAR99',
    memberIds: Array.from(new Set([...(store.clinics[clinic1Id]?.memberIds || []), ...clinic1Members])),
    createdAt: store.clinics[clinic1Id]?.createdAt || pastDays(30)
  };

  store.clinics[clinic2Id] = {
    id: clinic2Id,
    name: 'Apex Sports & Spine Performance Clinic',
    adminId: 'doc_marcus_vance',
    inviteCode: 'APEX07',
    memberIds: clinic2Members,
    createdAt: pastDays(45)
  };

  store.clinics[clinic3Id] = {
    id: clinic3Id,
    name: 'CareWave Advanced Physical Therapy',
    adminId: 'doc_sarah_jenkins',
    inviteCode: 'WAVE42',
    memberIds: clinic3Members,
    createdAt: pastDays(60)
  };

  // --- SEED ASSIGNED EXERCISES (more comprehensive) ---
  const sampleAssignments = [
    {
      id: 'asgn_1',
      patientId: 'pat_shashwath_m',
      patientEmail: 'shashwathm4@gmail.com',
      doctorId: primaryDoctorId,
      doctorName: 'Dr. Rahul Verma, PT',
      exerciseId: 'shoulder_abduction',
      exerciseName: 'Shoulder Abduction',
      targetReps: 12,
      targetSets: 3,
      notes: 'Focus on keeping the neck relaxed and smooth arm elevation up to 90 degrees.',
      status: 'active',
      createdAt: pastDays(10)
    },
    {
      id: 'asgn_2',
      patientId: 'pat_shashwath_m',
      patientEmail: 'shashwathm4@gmail.com',
      doctorId: primaryDoctorId,
      doctorName: 'Dr. Rahul Verma, PT',
      exerciseId: 'neck_tilt',
      exerciseName: 'Neck Tilt (Lateral Flexion)',
      targetReps: 10,
      targetSets: 2,
      notes: 'Gentle tilt, avoid hiking opposite shoulder.',
      status: 'active',
      createdAt: pastDays(8)
    },
    {
      id: 'asgn_3',
      patientId: 'pat_ananya_rao',
      patientEmail: 'ananya.rao@example.com',
      doctorId: primaryDoctorId,
      doctorName: 'Dr. Rahul Verma, PT',
      exerciseId: 'shoulder_abduction',
      exerciseName: 'Shoulder Abduction',
      targetReps: 10,
      targetSets: 3,
      notes: 'Post-rotator cuff rehab phase 2.',
      status: 'active',
      createdAt: pastDays(7)
    },
    {
      id: 'asgn_4',
      patientId: 'pat_vikram_singh',
      patientEmail: 'vikram.singh@example.com',
      doctorId: primaryDoctorId,
      doctorName: 'Dr. Rahul Verma, PT',
      exerciseId: 'neck_tilt',
      exerciseName: 'Neck Tilt (Lateral Flexion)',
      targetReps: 8,
      targetSets: 3,
      notes: 'Cervical mobility drill — keep chin tucked during tilt.',
      status: 'active',
      createdAt: pastDays(5)
    },
    {
      id: 'asgn_5',
      patientId: 'pat_meera_iyer',
      patientEmail: 'meera.iyer@example.com',
      doctorId: primaryDoctorId,
      doctorName: 'Dr. Rahul Verma, PT',
      exerciseId: 'shoulder_abduction',
      exerciseName: 'Shoulder Abduction',
      targetReps: 10,
      targetSets: 2,
      notes: 'Early-stage frozen shoulder rehab. Stop if pain exceeds 4/10.',
      status: 'active',
      createdAt: pastDays(4)
    },
    {
      id: 'asgn_6',
      patientId: 'pat_sneha_patel',
      patientEmail: 'sneha.patel@example.com',
      doctorId: 'doc_priya_sharma',
      doctorName: 'Dr. Priya Sharma, MPT (Neuro)',
      exerciseId: 'neck_tilt',
      exerciseName: 'Neck Tilt (Lateral Flexion)',
      targetReps: 8,
      targetSets: 2,
      notes: 'Postural correction for chronic cervical strain.',
      status: 'active',
      createdAt: pastDays(6)
    },
    {
      id: 'asgn_7',
      patientId: 'pat_karan_johal',
      patientEmail: 'karan.johal@example.com',
      doctorId: 'doc_priya_sharma',
      doctorName: 'Dr. Priya Sharma, MPT (Neuro)',
      exerciseId: 'shoulder_abduction',
      exerciseName: 'Shoulder Abduction',
      targetReps: 12,
      targetSets: 3,
      notes: 'Neurological strengthening — emphasise controlled eccentric phase.',
      status: 'active',
      createdAt: pastDays(5)
    },
    {
      id: 'asgn_8',
      patientId: 'pat_rohit_menon',
      patientEmail: 'rohit.menon@example.com',
      doctorId: 'doc_arun_kumar',
      doctorName: 'Dr. Arun Kumar, PT (Ortho)',
      exerciseId: 'shoulder_abduction',
      exerciseName: 'Shoulder Abduction',
      targetReps: 15,
      targetSets: 3,
      notes: 'Post-surgical (labral repair) — full ROM only if pain free.',
      status: 'active',
      createdAt: pastDays(3)
    },
    {
      id: 'asgn_9',
      patientId: 'pat_james_miller',
      patientEmail: 'jmiller@example.com',
      doctorId: 'doc_marcus_vance',
      doctorName: 'Dr. Marcus Vance, DPT, OCS',
      exerciseId: 'shoulder_abduction',
      exerciseName: 'Shoulder Abduction',
      targetReps: 12,
      targetSets: 4,
      notes: 'Sports return protocol — use resistance band on last set.',
      status: 'active',
      createdAt: pastDays(15)
    },
    {
      id: 'asgn_10',
      patientId: 'pat_sophia_martinez',
      patientEmail: 'smartinez@example.com',
      doctorId: 'doc_sarah_jenkins',
      doctorName: 'Dr. Sarah Jenkins, PT (Spine Specialist)',
      exerciseId: 'neck_tilt',
      exerciseName: 'Neck Tilt (Lateral Flexion)',
      targetReps: 10,
      targetSets: 3,
      notes: 'Spine mobilisation component — pair with diaphragmatic breathing.',
      status: 'active',
      createdAt: pastDays(18)
    }
  ];

  for (const asgn of sampleAssignments) {
    store.assignedExercises[asgn.id] = asgn;
  }

  // --- SEED REALISTIC EXERCISE SESSIONS & REPS ---
  // Only add seed sessions if they don't exist already
  const seedSessions = [
    {
      sessionId: 'sess_seed_101',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_shashwath_m',
      startedAt: pastDays(9),
      endedAt: pastDays(9),
      status: 'completed',
      totalReps: 12,
      correctReps: 9,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 82, romScore: 80, tempoScore: 84, peakAngle: 85 },
        { repNumber: 2, correct: true, qualityScore: 79, romScore: 77, tempoScore: 81, peakAngle: 83 },
        { repNumber: 3, correct: false, qualityScore: 58, romScore: 55, tempoScore: 62, issue: 'Shoulder hike compensation', severity: 'moderate', peakAngle: 70 },
        { repNumber: 4, correct: true, qualityScore: 84, romScore: 82, tempoScore: 86, peakAngle: 87 },
        { repNumber: 5, correct: true, qualityScore: 81, romScore: 80, tempoScore: 82, peakAngle: 84 },
        { repNumber: 6, correct: false, qualityScore: 61, romScore: 59, tempoScore: 63, issue: 'Torso lean', severity: 'mild', peakAngle: 74 },
        { repNumber: 7, correct: true, qualityScore: 85, romScore: 84, tempoScore: 86, peakAngle: 88 },
        { repNumber: 8, correct: true, qualityScore: 87, romScore: 86, tempoScore: 88, peakAngle: 89 },
        { repNumber: 9, correct: false, qualityScore: 63, romScore: 60, tempoScore: 66, issue: 'Incomplete ROM', severity: 'moderate', peakAngle: 72 },
        { repNumber: 10, correct: true, qualityScore: 86, romScore: 85, tempoScore: 87, peakAngle: 88 },
        { repNumber: 11, correct: true, qualityScore: 83, romScore: 82, tempoScore: 84, peakAngle: 86 },
        { repNumber: 12, correct: true, qualityScore: 88, romScore: 87, tempoScore: 89, peakAngle: 90 }
      ]
    },
    {
      sessionId: 'sess_seed_102',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_shashwath_m',
      startedAt: pastDays(6),
      endedAt: pastDays(6),
      status: 'completed',
      totalReps: 12,
      correctReps: 11,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 90 },
        { repNumber: 2, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 91 },
        { repNumber: 3, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 90 },
        { repNumber: 4, correct: false, qualityScore: 68, romScore: 65, tempoScore: 72, issue: 'Shoulder hike compensation', severity: 'mild', peakAngle: 78 },
        { repNumber: 5, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 92 },
        { repNumber: 6, correct: true, qualityScore: 94, romScore: 93, tempoScore: 95, peakAngle: 93 },
        { repNumber: 7, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 90 },
        { repNumber: 8, correct: true, qualityScore: 95, romScore: 94, tempoScore: 96, peakAngle: 93 },
        { repNumber: 9, correct: true, qualityScore: 89, romScore: 88, tempoScore: 90, peakAngle: 88 },
        { repNumber: 10, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 91 },
        { repNumber: 11, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 89 },
        { repNumber: 12, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 92 }
      ]
    },
    {
      sessionId: 'sess_seed_103',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_shashwath_m',
      startedAt: pastDays(3),
      endedAt: pastDays(3),
      status: 'completed',
      totalReps: 12,
      correctReps: 12,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 95, romScore: 94, tempoScore: 96, peakAngle: 92 },
        { repNumber: 2, correct: true, qualityScore: 96, romScore: 95, tempoScore: 97, peakAngle: 93 },
        { repNumber: 3, correct: true, qualityScore: 94, romScore: 93, tempoScore: 95, peakAngle: 91 },
        { repNumber: 4, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 90 },
        { repNumber: 5, correct: true, qualityScore: 97, romScore: 96, tempoScore: 97, peakAngle: 92 },
        { repNumber: 6, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 90 },
        { repNumber: 7, correct: true, qualityScore: 95, romScore: 95, tempoScore: 96, peakAngle: 92 },
        { repNumber: 8, correct: true, qualityScore: 94, romScore: 93, tempoScore: 94, peakAngle: 91 },
        { repNumber: 9, correct: true, qualityScore: 96, romScore: 95, tempoScore: 97, peakAngle: 93 },
        { repNumber: 10, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 91 },
        { repNumber: 11, correct: true, qualityScore: 95, romScore: 94, tempoScore: 95, peakAngle: 92 },
        { repNumber: 12, correct: true, qualityScore: 97, romScore: 96, tempoScore: 98, peakAngle: 94 }
      ]
    },
    {
      sessionId: 'sess_seed_104',
      exerciseId: 'neck_tilt',
      patientId: 'pat_shashwath_m',
      startedAt: pastDays(7),
      endedAt: pastDays(7),
      status: 'completed',
      totalReps: 10,
      correctReps: 8,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 85, romScore: 83, tempoScore: 87, peakAngle: 42 },
        { repNumber: 2, correct: true, qualityScore: 88, romScore: 87, tempoScore: 89, peakAngle: 44 },
        { repNumber: 3, correct: false, qualityScore: 60, romScore: 58, tempoScore: 63, issue: 'Opposite shoulder hike', severity: 'mild', peakAngle: 30 },
        { repNumber: 4, correct: true, qualityScore: 89, romScore: 88, tempoScore: 90, peakAngle: 45 },
        { repNumber: 5, correct: true, qualityScore: 87, romScore: 86, tempoScore: 88, peakAngle: 43 },
        { repNumber: 6, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 45 },
        { repNumber: 7, correct: false, qualityScore: 62, romScore: 60, tempoScore: 64, issue: 'Rotation instead of flexion', severity: 'moderate', peakAngle: 28 },
        { repNumber: 8, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 44 },
        { repNumber: 9, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 46 },
        { repNumber: 10, correct: true, qualityScore: 88, romScore: 87, tempoScore: 89, peakAngle: 43 }
      ]
    },
    {
      sessionId: 'sess_seed_105',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_ananya_rao',
      startedAt: pastDays(5),
      endedAt: pastDays(5),
      status: 'completed',
      totalReps: 10,
      correctReps: 8,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 88, romScore: 85, tempoScore: 90, peakAngle: 87 },
        { repNumber: 2, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 89 },
        { repNumber: 3, correct: false, qualityScore: 62, romScore: 60, tempoScore: 65, issue: 'Incomplete ROM', severity: 'moderate', peakAngle: 72 },
        { repNumber: 4, correct: true, qualityScore: 91, romScore: 90, tempoScore: 91, peakAngle: 90 },
        { repNumber: 5, correct: true, qualityScore: 89, romScore: 88, tempoScore: 90, peakAngle: 88 },
        { repNumber: 6, correct: false, qualityScore: 64, romScore: 62, tempoScore: 66, issue: 'Torso sway', severity: 'mild', peakAngle: 75 },
        { repNumber: 7, correct: true, qualityScore: 92, romScore: 91, tempoScore: 92, peakAngle: 91 },
        { repNumber: 8, correct: true, qualityScore: 93, romScore: 92, tempoScore: 93, peakAngle: 92 },
        { repNumber: 9, correct: true, qualityScore: 90, romScore: 89, tempoScore: 90, peakAngle: 90 },
        { repNumber: 10, correct: true, qualityScore: 89, romScore: 88, tempoScore: 90, peakAngle: 88 }
      ]
    },
    {
      sessionId: 'sess_seed_106',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_ananya_rao',
      startedAt: pastDays(2),
      endedAt: pastDays(2),
      status: 'completed',
      totalReps: 10,
      correctReps: 9,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 90 },
        { repNumber: 2, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 92 },
        { repNumber: 3, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 89 },
        { repNumber: 4, correct: true, qualityScore: 94, romScore: 93, tempoScore: 95, peakAngle: 93 },
        { repNumber: 5, correct: false, qualityScore: 66, romScore: 64, tempoScore: 68, issue: 'Incomplete ROM', severity: 'mild', peakAngle: 76 },
        { repNumber: 6, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 91 },
        { repNumber: 7, correct: true, qualityScore: 95, romScore: 94, tempoScore: 96, peakAngle: 94 },
        { repNumber: 8, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 90 },
        { repNumber: 9, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 92 },
        { repNumber: 10, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 89 }
      ]
    },
    {
      sessionId: 'sess_seed_107',
      exerciseId: 'neck_tilt',
      patientId: 'pat_vikram_singh',
      startedAt: pastDays(4),
      endedAt: pastDays(4),
      status: 'completed',
      totalReps: 8,
      correctReps: 7,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 86, romScore: 84, tempoScore: 88, peakAngle: 42 },
        { repNumber: 2, correct: true, qualityScore: 89, romScore: 88, tempoScore: 90, peakAngle: 44 },
        { repNumber: 3, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 45 },
        { repNumber: 4, correct: false, qualityScore: 59, romScore: 57, tempoScore: 61, issue: 'Rotation instead of flexion', severity: 'moderate', peakAngle: 26 },
        { repNumber: 5, correct: true, qualityScore: 88, romScore: 87, tempoScore: 89, peakAngle: 43 },
        { repNumber: 6, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 46 },
        { repNumber: 7, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 44 },
        { repNumber: 8, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 47 }
      ]
    },
    {
      sessionId: 'sess_seed_108',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_meera_iyer',
      startedAt: pastDays(3),
      endedAt: pastDays(3),
      status: 'completed',
      totalReps: 10,
      correctReps: 7,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 78, romScore: 75, tempoScore: 80, peakAngle: 80 },
        { repNumber: 2, correct: true, qualityScore: 80, romScore: 78, tempoScore: 82, peakAngle: 82 },
        { repNumber: 3, correct: false, qualityScore: 55, romScore: 52, tempoScore: 58, issue: 'Pain compensation — stopped early', severity: 'moderate', peakAngle: 65 },
        { repNumber: 4, correct: true, qualityScore: 82, romScore: 80, tempoScore: 84, peakAngle: 84 },
        { repNumber: 5, correct: false, qualityScore: 50, romScore: 48, tempoScore: 52, issue: 'Incomplete ROM', severity: 'severe', peakAngle: 58 },
        { repNumber: 6, correct: true, qualityScore: 79, romScore: 77, tempoScore: 81, peakAngle: 81 },
        { repNumber: 7, correct: true, qualityScore: 83, romScore: 82, tempoScore: 84, peakAngle: 85 },
        { repNumber: 8, correct: false, qualityScore: 57, romScore: 54, tempoScore: 60, issue: 'Shoulder hike compensation', severity: 'moderate', peakAngle: 68 },
        { repNumber: 9, correct: true, qualityScore: 81, romScore: 80, tempoScore: 82, peakAngle: 83 },
        { repNumber: 10, correct: true, qualityScore: 84, romScore: 83, tempoScore: 85, peakAngle: 86 }
      ]
    }
  ];

  for (const sess of seedSessions) {
    if (!store.sessions[sess.sessionId]) {
      store.sessions[sess.sessionId] = sess;
    }
  }

  // Write back to file
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');

  console.log('[Seed] ✓ Successfully seeded clinics, doctors, patients, exercises, and sessions!');
  console.log(`  Primary doctor UID: ${primaryDoctorId} (${primaryDoctorEmail})`);
  console.log(`  Clinics: ${Object.keys(store.clinics).length}`);
  console.log(`  Users: ${Object.keys(store.users).length}`);
  console.log(`  Assigned Exercises: ${Object.keys(store.assignedExercises).length}`);
  console.log(`  Sessions: ${Object.keys(store.sessions).length}`);
}

// Export for use by server.js auto-seed AND direct CLI execution
module.exports = { seedData };

// Run directly if invoked as a script
if (require.main === module) {
  seedData();
}
