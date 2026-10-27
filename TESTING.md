# Test Plan & Verification Matrix

Automated test suite documentation for CogniSense AI Physiotherapy Assistant.

## Test Running Commands

### Backend Tests
```bash
cd backend
npm test
npm run test:coverage
```

### Frontend Tests
```bash
cd frontend
npm test
```

---

## Environment & Mocking Disclosures
1. **Zero External Network / Cloud Touching**: All tests execute strictly offline. Firebase Admin and client SDKs are fully isolated using in-memory mock stores and bypass flags. Gemini API endpoints are stubbed/gated to prevent accidental quota consumption or token exposure.
2. **Headless Environment (jsdom)**: Camera feeds, WebGL canvas contexts, Web Speech synthesis, and MediaPipe WASM binary workers are mocked in frontend tests to ensure ultra-fast, deterministic CI execution.

---

## Feature Mapping Matrix (Features 1–23 + AI PDF Summary)

| Feature ID & Name | Implementation Files | Test Suite Files | Verification Details |
|---|---|---|---|
| **Feature 1: Rep Detection & State Machine** | `useRepDetection.js`, `useHoldDetection.js` | `frontend/src/__tests__/useRepDetection.test.js`, `frontend/src/__tests__/ExerciseSession.integration.test.jsx` | Verifies hysteresis angle thresholds, ASCENDING -> PEAK -> DESCENDING state progression, minimum rep duration, and hold countdowns. |
| **Feature 2: Angle Calculation & Side Selection** | `angleUtils.js`, `useAngleComputation.js` | `frontend/src/__tests__/angleUtils.test.js` | 2D/3D Euclidean vector angles, vertical offset projection, missing landmark null handling, and side flipping. |
| **Feature 3: Checkpoint Verification** | `checkpointComparison.js` | `frontend/src/__tests__/checkpointComparison.test.js` | Verifies 0%, 25%, 50%, 75%, and 100% trajectory interpolation and tolerance checks against reference templates. |
| **Feature 4: Multi-Dimensional Rep Quality** | `repQuality.js` | `frontend/src/__tests__/repQuality.test.js` | Computes ROM, Smoothness (jerk minimization), and Tempo score to assign composite 0-100 quality scores. |
| **Feature 5: Fatigue & Degradation Detection** | `utils/fatigueDetection.js`, `services/sessionMetrics.js` | `backend/tests/sessionMetrics.test.js` | Evaluates consecutive rep tempo drops and range reduction. Verifies exact parity between backend and frontend detectors. |
| **Feature 6: Offline Queue & Resilience** | `services/offlineQueue.js`, `services/api.js` | `frontend/src/__tests__/offlineQueue.test.js`, `frontend/src/__tests__/api.test.js` | IndexedDB persistence, batch queuing with `local_` session IDs, retry backoff, and transparent online re-flushing. |
| **Feature 7: Real-Time Audio / Voice Coach** | `hooks/useVoiceCoach.js` | `frontend/src/__tests__/utils.test.js`, `frontend/src/__tests__/ExerciseSession.integration.test.jsx` | Rate limiting cooldowns, priority cues (compensations over generic feedback), and graceful speech synthesis fallback. |
| **Feature 8: Hold Exercise Support** | `useHoldDetection.js`, `ExerciseSession.jsx` | `frontend/src/__tests__/useRepDetection.test.js` | Continuous target range evaluation, hold break counters, and hold quality metrics. |
| **Feature 9: Compensation Detection** | `utils/compensation.js`, `ExerciseSession.jsx` | `frontend/src/__tests__/utils.test.js` | Posture baselining and detection of knee valgus, pelvic tilt, and trunk lean with automated corrective voice cues. |
| **Feature 10: Framing Gate & Tracking Lost** | `hooks/useFramingGate.js`, `FramingOverlay.jsx` | `frontend/src/__tests__/ExerciseSession.integration.test.jsx` | Bounding box checks, visibility thresholds, tracking recovery, and pause-on-exit gate behavior. |
| **Feature 11: Range of Motion Calibration** | `hooks/useCalibration.js`, `CalibrationPanel.jsx` | `frontend/src/__tests__/utils.test.js` | Two-phase resting angle and maximum comfortable range sampling with persistence in localStorage. |
| **Feature 12: Role-Based Access Control** | `middleware/auth.js`, `ProtectedRoute.jsx` | `backend/tests/routes.matrix.test.js`, `frontend/src/__tests__/Router.test.jsx` | Patient vs Doctor token verification, role guarding, clinic isolation, and cross-patient access rejection (403/401). |
| **Feature 13: Doctor Exercise & Routine Builder** | `routes/exercises.js`, `routes/programs.js` | `backend/tests/features.routes.test.js` | Custom exercise creation, checkpoint authoring, routine grouping, and patient assignments. |
| **Feature 14: Doctor Patient Adherence Panel** | `components/doctor/AdherencePanel.jsx` | `frontend/src/__tests__/DoctorPanels.test.jsx` | 7-day adherence calculations, status badges (`on_track`, `behind`, `at_risk`), and interactive patient drill-down. |
| **Feature 15: Longitudinal Patient Trends** | `components/doctor/PatientTrends.jsx`, `TrendChart.jsx` | `frontend/src/__tests__/DoctorPanels.test.jsx`, `frontend/src/__tests__/TrendChart.test.jsx` | SVG path interpolation, quality trajectories, and common error frequencies across past sessions. |
| **Feature 16: Skeleton Playback System** | `routes/playback.js`, `components/doctor/SessionPlayback.jsx` | `backend/tests/features.routes.test.js`, `frontend/src/__tests__/DoctorPanels.test.jsx` | Landmark packing/unpacking, delta highlights, and scrubber playback of patient rep executions. |
| **Feature 17: In-Session Clinician Comments** | `routes/comments.js`, `components/SessionComments.jsx` | `backend/tests/features.routes.test.js`, `frontend/src/__tests__/SessionComponents.test.jsx` | Two-way commenting, unread badge counters, polling intervals, and read acknowledgments. |
| **Feature 18: Clinical Risk Engine** | `services/riskAnalysis.js` | `backend/tests/engines.test.js` | Rule-based triage evaluating low compliance, consecutive missed days, and form degradation. |
| **Feature 19: Adaptive Difficulty Progression** | `services/progressionEngine.js` | `backend/tests/engines.test.js` | Automatically adjusts target angles and rep targets based on recent session success rates. |
| **Feature 20: ML Data Mining & Telemetry** | `services/mlMiningService.js`, `MLDataMiningPanel.jsx` | `backend/tests/engines.test.js` | Synthesizes kinematic time-series telemetry and detects multi-session movement signatures. |
| **Feature 21: Client Rep Classifier Models** | `services/repModelTraining.js`, `hooks/useRepClassifier.js` | `backend/tests/routes.matrix.test.js` | Doctor-curated rep model storage, training endpoints, and edge classification. |
| **Feature 22: Clinical Data Privacy & Consent** | `routes/privacy.js`, `utils/consent.js` | `backend/tests/features.routes.test.js` | Consent gating for cloud AI analysis, GDPR data export, and complete user history deletion (`/api/privacy/my-data`). |
| **Feature 23: PDF Progress Report Generation** | `services/pdfReport.js`, `routes/reports.js` | `backend/tests/report.pdf.test.js` | Multi-page clinical PDF export with pagination, stats, compliance charts, and disclaimer. |
| **Feature Part B: AI-Generated PDF Summary** | `services/reportSummary.js`, `services/pdfReport.js` | `backend/tests/reportSummary.test.js`, `backend/tests/report.pdf.test.js` | Gemini VLM summary generation with 8s timeout, model failover, cloud AI consent gate, deterministic rule-based fallback, and `?ai=0` bypass. |

---

## Total Test Suite Counts
- **Backend**: 62 tests across 10 test files (100% passing).
- **Frontend**: 66 tests across 12 test files (100% passing).
- **Combined Total**: **128 automated tests passing**.
