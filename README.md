# CogniSense — AI Physiotherapy Assistant

Real-time posture tracking and AI-powered form verification for physiotherapy exercises. Uses client-side MediaPipe landmark extraction, a Node.js Express backend, Google Gemini VLM API, Firebase Auth + Firestore, and on-device rep classification.

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Real-time pose tracking** | MediaPipe PoseLandmarker running client-side with WebGL/GPU acceleration |
| 2 | **Angle computation** | Live 2D vector angle calculations (three-point, line-to-line, neck rotation heuristic) |
| 3 | **Rep detection state machine** | `IDLE → ASCENDING → PEAK → DESCENDING → COMPLETE` with jitter filtering |
| 4 | **5-checkpoint comparison** | Splits reps into 0/25/50/75/100% checkpoints against reference profiles |
| 5 | **Gemini VLM verification** | Sends peak-frame images to Gemini 1.5 Flash for structured form feedback |
| 6 | **Doctor & patient dashboards** | Role-based views with session history, analytics, and assignment management |
| 7 | **Exercise builder** | Doctors can create custom exercises with angle thresholds and checkpoints |
| 8 | **Exercise programs** | Weekly plans with progression rules (auto-advance after N good sessions) |
| 9 | **PDF progress reports** | One-click PDF export of a patient's session history and statistics |
| 10 | **Multi-doctor & clinics** | Clinic admin, invite codes, clinic-level patient lists |
| 11 | **Gemini coaching summary** | AI-generated session coaching notes and form improvement tips |
| 12 | **Adaptive difficulty** | Personalized angle thresholds that adjust based on patient performance |
| 13 | **Injury-risk & plateau detection** | Backend analysis of trends to flag stagnation or risk |
| 14 | **On-device rep classification** | TensorFlow.js-based local model for offline-capable rep validation |
| 15 | **Fatigue detection** | Monitors rep quality decline over a session to suggest rest |
| 16 | **Offline / PWA mode** | Installable app, service worker caching, and offline rep queue with background sync |
| 17 | **Rate limiting & input validation** | Per-user rate limits, Zod schema validation on all API inputs |
| 18 | **Privacy controls** | Consent gate for cloud AI, no stored camera frames, account data deletion |
| 19 | **Mobile-responsive layout** | Portrait-mode camera support, responsive grids and media queries |
| 20 | **Voice coaching** | Browser speech synthesis for hands-free exercise guidance |
| 21 | **Session playback** | Doctors can replay a patient's landmark data frame-by-frame |
| 22 | **Session comments** | Doctor–patient notes attached to individual sessions |
| 23 | **Compensation detection** | Detects trunk lean and shoulder hiking during exercises |

---

## Technical Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                       FRONTEND (React + Vite)                  │
│                                                                │
│  MediaPipe PoseLandmarker  →  Angle Utils  →  Rep State Machine│
│           ↓                        ↓               ↓           │
│    Skeleton Canvas          Checkpoint Comp.   Rep Classifier  │
│                                    ↓               ↓           │
│                              Mismatch? ──→ Local verdict       │
│                              Match?   ──→ POST /api/verify-rep │
│                                                                │
│  Service Worker (PWA)  ←→  Offline Queue  ←→  API Service      │
└────────────────────────────────────────────────────────────────┘
                              ↕ HTTPS
┌────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express + Node.js)                 │
│                                                                │
│  Middleware: CORS → JSON Parser → Rate Limiter → Auth → Role  │
│          → Zod Validation → Route Handler                      │
│                                                                │
│  Services: Gemini VLM │ Firestore │ PDF Report │ Coaching      │
│            Risk Analysis │ Personalization │ Progression       │
└────────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────────────────────────────────────────────────────┐
│              FIREBASE  (Auth + Firestore + Hosting)            │
└────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **Web camera** access in your browser
- **Firebase project** with Auth + Firestore enabled
- **Gemini API key** (free from Google AI Studio)

### 1. Clone the repository

```bash
git clone <repo-url>
cd final_year
```

### 2. Backend setup

```bash
cd backend
npm install
```

Create a `backend/.env` file:

```env
# Google Gemini (required for VLM verification & coaching)
GEMINI_API_KEY=AIzaSy...

# Firebase Admin SDK — pick one method:
# Method 1: Service account JSON file
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json

# Method 2: Environment variables
# FIREBASE_PROJECT_ID=your-project-id
# FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Optional
PORT=3001
CORS_ORIGIN=http://localhost:3000
TRUST_PROXY=1
```

Start the server:

```bash
node src/server.js
```

The backend runs at **`http://localhost:3001`**.

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at **`http://localhost:3000`**.

### 4. Run tests

```bash
# Backend (Node.js built-in test runner)
cd backend
npm test

# Frontend (Vitest)
cd frontend
npm test
```

### 5. Production build

```bash
cd frontend
npm run build    # Output in frontend/dist/
npm run preview  # Preview the production build locally
```

---

## Service Configuration

### A. Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **Create API key**.
3. Copy and paste into `backend/.env` as `GEMINI_API_KEY`.

### B. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/) → create/select a project.
2. Enable **Authentication** (Email/Password provider).
3. Enable **Firestore Database** in production mode.
4. Go to **Project Settings → Service accounts → Generate new private key**.
5. Save the JSON file as `backend/serviceAccountKey.json` and set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`.
6. Copy the Firebase web config into `frontend/src/config/firebase.js` (already configured if using the same project).

> **Note:** If Firebase credentials are omitted, the backend operates in graceful fallback mode with in-memory storage.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/verify-rep` | Patient | Sends peak frame for Gemini VLM verification |
| `POST` | `/api/session/start` | Patient | Start a new exercise session |
| `POST` | `/api/session/log-rep` | Patient | Log a single rep with angles and verdict |
| `POST` | `/api/session/end` | Patient | End session with summary stats |
| `GET`  | `/api/users/profile` | Any | Get current user profile |
| `GET`  | `/api/users/patients` | Doctor | List doctor's patients |
| `POST` | `/api/users/add-patient` | Doctor | Add a patient by email |
| `GET`  | `/api/exercises` | Any | List all exercises |
| `POST` | `/api/exercises` | Doctor | Create a custom exercise |
| `GET`  | `/api/assignments/:patientId` | Any | Get patient's exercise assignments |
| `POST` | `/api/assignments` | Doctor | Assign an exercise to a patient |
| `GET`  | `/api/analytics/:patientId` | Any | Session analytics for a patient |
| `GET`  | `/api/comments/:sessionId` | Any | Get session comments |
| `POST` | `/api/comments/:sessionId` | Any | Add a session comment |
| `POST` | `/api/clinics` | Doctor | Create a clinic |
| `POST` | `/api/clinics/:id/join` | Doctor | Join a clinic via invite code |
| `GET`  | `/api/programs/:patientId` | Any | Get patient's exercise programs |
| `POST` | `/api/programs` | Doctor | Create an exercise program |
| `GET`  | `/api/reports/:patientId/pdf` | Doctor | Download patient PDF report |
| `GET`  | `/api/insights/:patientId` | Any | AI coaching insights & risk analysis |
| `GET`  | `/api/models/rep-classifier` | Patient | Download on-device classifier weights |
| `GET`  | `/api/privacy/consent` | Any | Get consent status |
| `POST` | `/api/privacy/consent` | Any | Update consent preferences |
| `DELETE`| `/api/privacy/account` | Any | Delete account and all data |
| `GET`  | `/api/health` | — | Health check |

---

## Project Structure

```
final_year/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── firebase.js              # Firebase Admin SDK init
│   │   ├── middleware/
│   │   │   ├── rateLimits.js            # Per-user & global rate limiters
│   │   │   ├── requireAuth.js           # Firebase JWT verification
│   │   │   ├── requireClinic.js         # Clinic membership guard
│   │   │   ├── requireRole.js           # Role-based access control
│   │   │   └── validate.js              # Zod schema validation middleware
│   │   ├── routes/
│   │   │   ├── analytics.js             # Session analytics endpoints
│   │   │   ├── assignments.js           # Exercise assignment CRUD
│   │   │   ├── clinics.js               # Multi-doctor clinic management
│   │   │   ├── comments.js              # Session comment threads
│   │   │   ├── exercises.js             # Exercise definition CRUD
│   │   │   ├── insights.js              # AI coaching & risk analysis
│   │   │   ├── models.js                # On-device model weights
│   │   │   ├── privacy.js               # Consent & data deletion
│   │   │   ├── programs.js              # Exercise program management
│   │   │   ├── reports.js               # PDF report generation
│   │   │   ├── session.js               # Session lifecycle & rep logging
│   │   │   ├── users.js                 # User profile & patient management
│   │   │   └── verify.js               # Gemini VLM rep verification
│   │   ├── scripts/
│   │   │   ├── promoteDoctor.js         # CLI: promote user to doctor role
│   │   │   ├── seedExercises.js         # CLI: seed default exercises
│   │   │   └── trainRepClassifier.js    # CLI: train on-device classifier
│   │   ├── services/
│   │   │   ├── access.js               # Permission helpers
│   │   │   ├── analytics.js            # Analytics computation
│   │   │   ├── coaching.js             # Gemini coaching summaries
│   │   │   ├── entities.js             # Firestore entity helpers
│   │   │   ├── firestore.js            # Core Firestore CRUD operations
│   │   │   ├── gemini.js               # Gemini 1.5 Flash structured output
│   │   │   ├── pdfReport.js            # PDFKit report generation
│   │   │   ├── personalization.js      # Adaptive difficulty engine
│   │   │   ├── progression.js          # Program progression logic
│   │   │   ├── repClassifier.js        # Server-side rep classifier
│   │   │   ├── riskAnalysis.js         # Injury-risk & plateau detection
│   │   │   └── sessionMetrics.js       # Session-level metric aggregation
│   │   ├── validation/
│   │   │   └── schemas.js              # Zod validation schemas
│   │   └── server.js                   # Express app entry point
│   ├── tests/
│   │   ├── http.test.js                # HTTP integration tests
│   │   └── validate.test.js            # Schema unit tests
│   ├── .env                            # Environment configuration
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   ├── manifest.webmanifest        # PWA manifest
│   │   ├── sw.js                       # Service worker (offline caching)
│   │   ├── mediapipe/                  # MediaPipe WASM + model files
│   │   ├── models/                     # On-device classifier weights
│   │   └── icons/                      # PWA icons
│   ├── scripts/
│   │   └── prepare-mediapipe.mjs       # Copies MediaPipe assets to public/
│   ├── src/
│   │   ├── __tests__/
│   │   │   ├── angleUtils.test.js      # Vector math unit tests
│   │   │   ├── checkpointComparison.test.js  # Checkpoint logic tests
│   │   │   ├── repQuality.test.js      # Rep quality scoring tests
│   │   │   └── useRepDetection.test.js # State machine tests
│   │   ├── components/
│   │   │   ├── CalibrationPanel.jsx    # Sensor calibration UI
│   │   │   ├── ConnectionBadge.jsx     # Online/offline status indicator
│   │   │   ├── ConsentGate.jsx         # Privacy consent modal
│   │   │   ├── ExerciseSelector.jsx    # Exercise picker cards
│   │   │   ├── ExerciseSession.jsx     # Session orchestrator & HUD
│   │   │   ├── FeedbackToast.jsx       # Animated post-rep feedback
│   │   │   ├── FramingOverlay.jsx      # Body framing guide overlay
│   │   │   ├── OfflineBanner.jsx       # Offline status & sync banner
│   │   │   ├── PoseCamera.jsx          # Webcam feed & skeleton canvas
│   │   │   ├── ProtectedRoute.jsx      # Auth route guard
│   │   │   ├── SessionComments.jsx     # Session comment thread UI
│   │   │   ├── SessionSummary.jsx      # End-of-session stats modal
│   │   │   ├── charts/
│   │   │   │   └── TrendChart.jsx      # Canvas-based trend chart
│   │   │   └── doctor/
│   │   │       ├── AdherencePanel.jsx  # Patient adherence view
│   │   │       ├── PatientTrends.jsx   # Patient progress trends
│   │   │       └── SessionPlayback.jsx # Landmark replay viewer
│   │   ├── config/
│   │   │   └── exercises.json          # Exercise definitions
│   │   ├── context/
│   │   │   └── AuthContext.jsx         # Firebase auth provider
│   │   ├── hooks/
│   │   │   ├── useAdaptiveConfig.js    # Adaptive difficulty hook
│   │   │   ├── useAngleComputation.js  # Angle math wrapper
│   │   │   ├── useCalibration.js       # Calibration workflow hook
│   │   │   ├── useFramingGate.js       # Body framing detection
│   │   │   ├── useHoldDetection.js     # Hold/isometric rep detection
│   │   │   ├── useInstallPrompt.js     # PWA install prompt hook
│   │   │   ├── usePoseLandmarker.js    # MediaPipe lifecycle hook
│   │   │   ├── useRepClassifier.js     # On-device classifier hook
│   │   │   ├── useRepDetection.js      # Rep state machine hook
│   │   │   └── useVoiceCoach.js        # Speech synthesis hook
│   │   ├── pages/
│   │   │   ├── ClinicPage.jsx          # Clinic management page
│   │   │   ├── DoctorDashboard.jsx     # Doctor's main dashboard
│   │   │   ├── ExerciseBuilder.jsx     # Custom exercise editor
│   │   │   ├── LoginPage.jsx           # Login form
│   │   │   ├── PatientDashboard.jsx    # Patient's main dashboard
│   │   │   ├── PrivacyPage.jsx         # Privacy settings page
│   │   │   ├── ProgramBuilder.jsx      # Exercise program editor
│   │   │   └── SignupPage.jsx          # Registration form
│   │   ├── services/
│   │   │   ├── api.js                  # Axios API client + offline sync
│   │   │   └── offlineQueue.js         # LocalStorage offline queue
│   │   ├── utils/
│   │   │   ├── angleUtils.js           # Vector math (threePointAngle, etc.)
│   │   │   ├── calibration.js          # Calibration math
│   │   │   ├── canvasDrawing.js        # Skeleton rendering on canvas
│   │   │   ├── checkpointComparison.js # 5-checkpoint interval logic
│   │   │   ├── compensation.js         # Compensation pattern detection
│   │   │   ├── consent.js              # Consent state helpers
│   │   │   ├── fatigueDetection.js     # Rep quality fatigue analysis
│   │   │   ├── framingCheck.js         # Body-in-frame validation
│   │   │   ├── landmarkSmoother.js     # Landmark noise smoothing
│   │   │   ├── landmarkUtils.js        # Landmark index constants
│   │   │   ├── localCoach.js           # Local coaching rule engine
│   │   │   ├── oneEuroFilter.js        # 1€ filter for jitter reduction
│   │   │   ├── playbackUtils.js        # Session playback helpers
│   │   │   ├── repClassifier.js        # On-device classifier logic
│   │   │   ├── repQuality.js           # Rep quality scoring engine
│   │   │   └── sideUtils.js            # Left/right side detection
│   │   ├── App.css                     # Application styles
│   │   ├── App.jsx                     # Root component + routing
│   │   ├── index.css                   # Dark-mode design system
│   │   └── main.jsx                    # Entry point + SW registration
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── firestore.rules                     # Firestore security rules
├── firebase.json                       # Firebase hosting config
└── README.md
```

---

## Docker & One-Command Run

The repository contains preconfigured Dockerfiles for both frontend (nginx proxy) and backend (Express), unified with Docker Compose.

### Run the Whole Application in One Command

```bash
docker compose up --build
```

- **Frontend Application**: [http://localhost:3000](http://localhost:3000)
- **Backend API Direct**: [http://localhost:3001/api/health](http://localhost:3001/api/health)
- **API Proxy**: Frontend automatically proxies `/api/*` to the backend container internally via Nginx.

### Files Created:
1. `docker-compose.yml` — Runs backend & frontend containers with health checks and volume/env wiring.
2. `backend/Dockerfile` & `backend/.dockerignore` — Node 20 Alpine production image.
3. `frontend/Dockerfile`, `frontend/.dockerignore`, & `frontend/nginx.conf` — Multi-stage build producing static assets served by Nginx with reverse proxy and caching.

To run in the background (detached):
```bash
docker compose up --build -d
```

To stop:
```bash
docker compose down
```

---

## Scripts Reference

### Backend

| Command | Description |
|---------|-------------|
| `npm start` | Start the server (`node src/server.js`) |
| `npm test` | Run tests with Node.js built-in test runner |
| `npm run train:model` | Train the on-device rep classifier |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest test suite |
| `npm run lint` | Lint with oxlint |

### Admin Scripts (Backend)

```bash
# Promote a user to doctor role
node src/scripts/promoteDoctor.js <user-uid>

# Seed default exercises into Firestore
node src/scripts/seedExercises.js

# Train the on-device rep classifier from session data
node src/scripts/trainRepClassifier.js
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for VLM verification |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes* | Path to Firebase service account JSON |
| `FIREBASE_PROJECT_ID` | Yes* | Firebase project ID (alt. to JSON file) |
| `FIREBASE_CLIENT_EMAIL` | Yes* | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Yes* | Firebase service account private key |
| `PORT` | No | Server port (default: `3001`) |
| `CORS_ORIGIN` | No | Allowed origins, comma-separated |
| `TRUST_PROXY` | No | Set to `1` behind a reverse proxy |

> \* Either `GOOGLE_APPLICATION_CREDENTIALS` **or** the three `FIREBASE_*` variables are required.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 8, React Router 7 |
| Pose Estimation | MediaPipe PoseLandmarker (WASM + GPU) |
| ML (on-device) | TensorFlow.js rep classifier |
| Backend | Express 4, Node.js 20+ |
| Database | Firebase Firestore |
| Authentication | Firebase Auth (Email/Password) |
| AI/VLM | Google Gemini 1.5 Flash |
| PDF Generation | PDFKit |
| Validation | Zod |
| Testing | Vitest (frontend), Node.js test runner (backend) |
| PWA | Custom service worker, Web App Manifest |

---

## License

This project is part of a final-year academic submission.
