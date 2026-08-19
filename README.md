# AI Physiotherapy Assistant — Phase I Core Pipeline

Real-time posture tracking + AI-based form verification for physiotherapy exercises using client-side MediaPipe landmark extraction, a Node.js Express backend, Google Gemini VLM API, and Firebase Firestore.

---

## Technical Architecture Overview

1. **Frontend (React + Vite)**:
   - **Pose Capture**: MediaPipe `@mediapipe/tasks-vision` `PoseLandmarker` running client-side with WebGL/GPU acceleration.
   - **Angle Computation**: Live angle calculations using 2D vector mathematics (`threePointAngle`, `lineToLineAngle`, `neckRotationHeuristic`).
   - **Rep Detection State Machine**: `IDLE` → `ASCENDING` → `PEAK` → `DESCENDING` → `COMPLETE`. Automatically samples keyframes (start, peak, return).
   - **5-Checkpoint Interval Comparison**: Splits reps into 0%, 25%, 50%, 75%, 100% checkpoints. Compares against reference angle profiles.
     - *If angle delta > threshold*: Immediate local mismatch alert; skips VLM call to save latency and API quota.
     - *If deltas within threshold*: Passes peak frame to backend for Gemini VLM inspection.

2. **Backend (Express)**:
   - **Gemini VLM API**: `POST /api/verify-rep` sends peak image to Gemini 1.5 Flash using structured output schemas (`responseSchema`) returning `{ correct, issue, severity }`.
   - **Firestore Logging**: `POST /api/session/log-rep` stores session data and rep history.

3. **Data-Driven Configuration (`exercises.json`)**:
   - exercises: `shoulder_abduction`, `neck_tilt`, `neck_rotation`.
   - Extensible: New exercises can be added strictly by adding new entries to `frontend/src/config/exercises.json`.

---

## Getting Started & Running Locally

### 1. Prerequisites
- Node.js 18+ installed on your system.
- Web Camera access in your browser.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
The frontend will start at **`http://localhost:3000`**.

### 3. Backend Setup
```bash
cd backend
npm install
node src/server.js
```
The backend will start at **`http://localhost:3001`**.

---

## Service Configuration Instructions

### A. Obtaining a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **Create API key**.
3. Copy your API key.
4. Open `backend/.env` and paste your key:
   ```env
   GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere...
   ```

### B. Setting Up Firebase Admin SDK (Firestore Database)
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create/select a project (e.g., `ai-physio-assistant`).
2. Navigate to **Build -> Firestore Database** and click **Create database**.
3. Navigate to **Project Settings (⚙️ icon) -> Service accounts**.
4. Click **Generate new private key** to download your JSON service account file (e.g., `serviceAccountKey.json`).
5. Choose one of the following methods to configure your backend:

   **Method 1: Service Account JSON File (Recommended)**
   Save the `.json` file inside your project (or outside version control) and set the path in `backend/.env`:
   ```env
   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
   ```

   **Method 2: Environment Variables**
   Extract the parameters from your service account `.json` file into `backend/.env`:
   ```env
   FIREBASE_PROJECT_ID=ai-physio-assistant
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ai-physio-assistant.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
   ```

*(Note: Official Firebase Admin SDK reference: [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup). If Firebase environment variables are omitted, the application operates in graceful fallback mode: local rep logging still functions in-memory).*

---

## Project Structure

```
final_year/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ExerciseSelector.jsx   # Exercise picker cards
│   │   │   ├── ExerciseSession.jsx    # Session orchestrator & HUD
│   │   │   ├── FeedbackToast.jsx      # Animated post-rep feedback toast
│   │   │   ├── PoseCamera.jsx         # Webcam feed & MediaPipe skeleton canvas
│   │   │   └── SessionSummary.jsx     # End of session summary modal & stats
│   │   ├── config/
│   │   │   └── exercises.json         # Data-driven exercise configs
│   │   ├── hooks/
│   │   │   ├── useAngleComputation.js # Angle math wrapper
│   │   │   ├── usePoseLandmarker.js   # MediaPipe lifecycle hook
│   │   │   └── useRepDetection.js     # Rep state machine hook
│   │   ├── services/
│   │   │   └── api.js                 # Axios API service
│   │   ├── utils/
│   │   │   ├── angleUtils.js          # Vector math
│   │   │   ├── canvasDrawing.js       # Skeleton rendering
│   │   │   ├── checkpointComparison.js# 5-checkpoint logic
│   │   │   └── landmarkUtils.js       # Landmark index constants
│   │   ├── App.css
│   │   ├── App.jsx
│   │   ├── index.css                  # Dark-mode design system
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── firebase.js            # Admin SDK initialization
│   │   ├── routes/
│   │   │   ├── session.js             # Session & rep logging endpoints
│   │   │   └── verify.js              # VLM verification endpoint
│   │   ├── services/
│   │   │   ├── firestore.js           # Firestore read/write
│   │   │   └── gemini.js              # Gemini 1.5 Flash structured output
│   │   └── server.js                  # Express app entry point
│   ├── .env                           # Environment configuration
│   └── package.json
└── README.md
```
