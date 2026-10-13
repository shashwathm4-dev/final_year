/**
 * Seed realistic mock clinics, doctors, patients, and sessions.
 * Preserves existing logged in doctor (e.g. rahul@gmail.com and their clinic Asaara).
 */
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../../data/store.json');

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
      console.warn('Could not read existing store, creating fresh.');
    }
  }

  // Ensure collections exist
  const collections = ['users', 'sessions', 'exercises', 'assignedExercises', 'sessionComments', 'playback', 'personalization', 'models', 'programs', 'patientPrograms', 'clinics'];
  for (const col of collections) {
    if (!store[col]) store[col] = {};
  }

  const now = new Date();
  const pastDays = (d) => new Date(now.getTime() - d * 86400000).toISOString();

  // Find existing logged-in doctor
  let existingDoctorId = null;
  let existingClinicId = null;
  for (const [uid, user] of Object.entries(store.users)) {
    if (user.role === 'doctor' && user.email === 'rahul@gmail.com') {
      existingDoctorId = uid;
      existingClinicId = user.clinicId;
      break;
    }
  }

  // Define Clinics Cluster
  // Clinic 1: Asaara (The active clinic linked to rahul@gmail.com if present)
  const clinic1Id = existingClinicId || 'clinic_asaara_ortho';
  // Clinic 2: Apex Sports & Spine Rehab
  const clinic2Id = 'clinic_apex_sports_rehab';
  // Clinic 3: CareWave Physical Therapy
  const clinic3Id = 'clinic_carewave_pt';

  // --- DOCTOR DEFINITIONS ---
  const doctors = [
    // In Clinic 1 (Asaara)
    {
      uid: existingDoctorId || 'doc_rahul_verma',
      email: 'rahul@gmail.com',
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

    // In Clinic 2 (Apex)
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

    // In Clinic 3 (CareWave)
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
    // Assigned to Dr. Rahul Verma (Clinic 1)
    {
      uid: 'pat_shashwath_m',
      email: 'shashwathm4@gmail.com',
      fullName: 'Shashwath M',
      role: 'patient',
      doctorId: existingDoctorId || 'doc_rahul_verma',
      createdAt: pastDays(14),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_ananya_rao',
      email: 'ananya.rao@example.com',
      fullName: 'Ananya Rao',
      role: 'patient',
      doctorId: existingDoctorId || 'doc_rahul_verma',
      createdAt: pastDays(10),
      updatedAt: now.toISOString()
    },
    {
      uid: 'pat_vikram_singh',
      email: 'vikram.singh@example.com',
      fullName: 'Vikram Singh',
      role: 'patient',
      doctorId: existingDoctorId || 'doc_rahul_verma',
      createdAt: pastDays(8),
      updatedAt: now.toISOString()
    },

    // Assigned to Dr. Priya Sharma (Clinic 1)
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

    // Assigned to Dr. Arun Kumar (Clinic 1)
    {
      uid: 'pat_rohit_menon',
      email: 'rohit.menon@example.com',
      fullName: 'Rohit Menon',
      role: 'patient',
      doctorId: 'doc_arun_kumar',
      createdAt: pastDays(9),
      updatedAt: now.toISOString()
    },

    // Assigned to Dr. Marcus Vance (Clinic 2)
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

    // Assigned to Dr. Elena Rostova (Clinic 2)
    {
      uid: 'pat_lucas_silva',
      email: 'lucas.silva@example.com',
      fullName: 'Lucas Silva',
      role: 'patient',
      doctorId: 'doc_elena_rostova',
      createdAt: pastDays(15),
      updatedAt: now.toISOString()
    },

    // Assigned to Dr. Sarah Jenkins (Clinic 3)
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

  // Store users
  for (const doc of doctors) {
    store.users[doc.uid] = { ...(store.users[doc.uid] || {}), ...doc };
  }
  for (const pat of patients) {
    store.users[pat.uid] = { ...(store.users[pat.uid] || {}), ...pat };
  }

  // --- CLINIC DEFINITIONS ---
  const clinic1Members = [existingDoctorId || 'doc_rahul_verma', 'doc_priya_sharma', 'doc_arun_kumar'];
  const clinic2Members = ['doc_marcus_vance', 'doc_elena_rostova', 'doc_david_chen'];
  const clinic3Members = ['doc_sarah_jenkins', 'doc_kavita_nair'];

  store.clinics[clinic1Id] = {
    id: clinic1Id,
    name: 'Asaara Orthopedic & Rehab Institute',
    adminId: existingDoctorId || 'doc_rahul_verma',
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

  // --- SEED SAMPLE ASSIGNED EXERCISES ---
  const sampleAssignments = [
    {
      id: 'asgn_1',
      patientId: 'pat_shashwath_m',
      patientEmail: 'shashwathm4@gmail.com',
      doctorId: existingDoctorId || 'doc_rahul_verma',
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
      doctorId: existingDoctorId || 'doc_rahul_verma',
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
      doctorId: existingDoctorId || 'doc_rahul_verma',
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
    }
  ];

  for (const asgn of sampleAssignments) {
    store.assignedExercises[asgn.id] = asgn;
  }

  // --- SEED REALISTIC EXERCISE SESSIONS & REPS ---
  const seedSessions = [
    {
      sessionId: 'sess_seed_101',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_shashwath_m',
      startedAt: pastDays(3),
      endedAt: pastDays(3),
      status: 'completed',
      totalReps: 12,
      correctReps: 11,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 94, romScore: 92, tempoScore: 95, peakAngle: 91 },
        { repNumber: 2, correct: true, qualityScore: 91, romScore: 89, tempoScore: 93, peakAngle: 89 },
        { repNumber: 3, correct: true, qualityScore: 96, romScore: 95, tempoScore: 96, peakAngle: 92 },
        { repNumber: 4, correct: false, qualityScore: 68, romScore: 65, tempoScore: 72, issue: 'Shoulder hike compensation', severity: 'mild', peakAngle: 78 },
        { repNumber: 5, correct: true, qualityScore: 90, romScore: 90, tempoScore: 90, peakAngle: 90 },
        { repNumber: 6, correct: true, qualityScore: 92, romScore: 91, tempoScore: 92, peakAngle: 91 },
        { repNumber: 7, correct: true, qualityScore: 95, romScore: 94, tempoScore: 95, peakAngle: 93 },
        { repNumber: 8, correct: true, qualityScore: 93, romScore: 92, tempoScore: 93, peakAngle: 90 },
        { repNumber: 9, correct: true, qualityScore: 89, romScore: 88, tempoScore: 90, peakAngle: 88 },
        { repNumber: 10, correct: true, qualityScore: 94, romScore: 93, tempoScore: 94, peakAngle: 91 },
        { repNumber: 11, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 90 },
        { repNumber: 12, correct: true, qualityScore: 90, romScore: 89, tempoScore: 91, peakAngle: 89 }
      ]
    },
    {
      sessionId: 'sess_seed_102',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_shashwath_m',
      startedAt: pastDays(1),
      endedAt: pastDays(1),
      status: 'completed',
      totalReps: 10,
      correctReps: 10,
      reps: [
        { repNumber: 1, correct: true, qualityScore: 95, romScore: 94, tempoScore: 96, peakAngle: 92 },
        { repNumber: 2, correct: true, qualityScore: 96, romScore: 95, tempoScore: 97, peakAngle: 93 },
        { repNumber: 3, correct: true, qualityScore: 94, romScore: 93, tempoScore: 95, peakAngle: 91 },
        { repNumber: 4, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 90 },
        { repNumber: 5, correct: true, qualityScore: 97, romScore: 96, tempoScore: 97, peakAngle: 92 },
        { repNumber: 6, correct: true, qualityScore: 92, romScore: 91, tempoScore: 93, peakAngle: 90 },
        { repNumber: 7, correct: true, qualityScore: 95, romScore: 95, tempoScore: 96, peakAngle: 92 },
        { repNumber: 8, correct: true, qualityScore: 94, romScore: 93, tempoScore: 94, peakAngle: 91 },
        { repNumber: 9, correct: true, qualityScore: 91, romScore: 90, tempoScore: 92, peakAngle: 89 },
        { repNumber: 10, correct: true, qualityScore: 93, romScore: 92, tempoScore: 94, peakAngle: 91 }
      ]
    },
    {
      sessionId: 'sess_seed_103',
      exerciseId: 'shoulder_abduction',
      patientId: 'pat_ananya_rao',
      startedAt: pastDays(2),
      endedAt: pastDays(2),
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
    }
  ];

  for (const sess of seedSessions) {
    store.sessions[sess.sessionId] = sess;
  }

  // Write back to file
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');

  console.log('✓ Successfully seeded clinics, doctors, patients, and sessions!');
  console.log(`- Total Clinics: ${Object.keys(store.clinics).length}`);
  console.log(`- Total Users: ${Object.keys(store.users).length}`);
  console.log(`- Total Assigned Exercises: ${Object.keys(store.assignedExercises).length}`);
  console.log(`- Total Sessions: ${Object.keys(store.sessions).length}`);
}

seedData();
