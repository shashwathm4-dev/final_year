# Deployment Guide — CogniSense AI Physiotherapy Assistant

This project is completely containerized and production-ready. You can deploy it using any of the following 3 options depending on your hosting preference.

---

## Architecture Overview
- **Frontend**: React 19 SPA + MediaPipe Tasks Vision + Vite + Nginx Reverse Proxy (`/api` routed to backend).
- **Backend**: Node.js Express API + in-process MCP Server + Firebase Admin SDK + Google Gemini AI.
- **Port Defaults**:
  - Frontend: `3000` (or `80` inside container)
  - Backend: `3001`

---

## Option 1: Single-Server / VPS Deployment (Docker Compose) — *Recommended & Simplest*

Best for: **AWS EC2, DigitalOcean Droplet, Linode, Hetzner, or any Linux VPS**.

### 1. Requirements
- Docker & Docker Compose installed on your server:
  ```bash
  sudo apt update && sudo apt install -y docker.io docker-compose
  sudo systemctl enable --now docker
  ```

### 2. Configure Environment Files
On your server inside the project root:
1. Ensure `backend/.env` is configured:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Set:
   - `GEMINI_API_KEY`: Your key from [Google AI Studio](https://aistudio.google.com/)
   - `serviceAccountKey.json`: Place your Firebase Admin Service Account key in `backend/` or configure the env variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
   - `ALLOW_DOCTOR_SELF_SIGNUP=false` (in real production)
   - `TRUST_PROXY=1`

### 3. Build & Run
```bash
docker-compose up --build -d
```

### 4. Verify
- App UI: `http://<your-server-ip>:3000`
- API Health Check: `http://<your-server-ip>:3001/api/health`

### 5. Add HTTPS / Domain (SSL with Certbot & Nginx)
To attach a custom domain with free SSL:
1. Point your domain DNS (e.g. `physio.yourdomain.com`) `A record` to your server IP.
2. Setup Nginx reverse proxy on the host:
   ```nginx
   server {
       server_name physio.yourdomain.com;
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
3. Issue SSL with Let's Encrypt:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d physio.yourdomain.com
   ```

---

## Option 2: Cloud Platform-as-a-Service (Render / Railway)

Best if you want free or low-cost hosting without managing a VPS.

### A. Deploy Backend on Render (Web Service)
1. Go to [Render.com](https://render.com) -> **New Web Service** -> Connect Git repository.
2. Root Directory: `backend`
3. Environment: `Node`
4. Build Command: `npm install --omit=dev`
5. Start Command: `node src/server.js`
6. Add Environment Variables:
   - `PORT`: `3001`
   - `NODE_ENV`: `production`
   - `GEMINI_API_KEY`: `<Your Gemini Key>`
   - `FIREBASE_PROJECT_ID`: `<Project ID>`
   - `FIREBASE_CLIENT_EMAIL`: `<Client Email>`
   - `FIREBASE_PRIVATE_KEY`: `<Private Key>`
   - `CORS_ORIGIN`: `https://your-frontend.vercel.app`
   - `TRUST_PROXY`: `1`
7. Click **Deploy**. Note your backend URL (e.g., `https://cognisense-backend.onrender.com`).

### B. Deploy Frontend on Vercel / Cloudflare Pages / Netlify
1. Go to [Vercel](https://vercel.com) -> **New Project** -> Select repository.
2. Framework Preset: `Vite`
3. Root Directory: `frontend`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://cognisense-backend.onrender.com/api`
7. Click **Deploy**.

---

## Option 3: Google Cloud Run (Fully Serverless Container)

Best for: High scalability and direct integration with Google Cloud & Firebase.

### 1. Build and Submit Container Images
```bash
# Backend
gcloud builds submit backend --tag gcr.io/<PROJECT_ID>/cognisense-backend

# Frontend
gcloud builds submit frontend --tag gcr.io/<PROJECT_ID>/cognisense-frontend
```

### 2. Deploy Services
```bash
# Backend
gcloud run deploy cognisense-backend \
  --image gcr.io/<PROJECT_ID>/cognisense-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=3001

# Frontend
gcloud run deploy cognisense-frontend \
  --image gcr.io/<PROJECT_ID>/cognisense-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## Pre-Deployment Health & Checklist
- [x] Backend test suite passed (`80/80` tests passing).
- [x] Frontend test suite passed (`88/88` tests passing).
- [x] Trigonometry & Angle Math verified for all 10 exercises (`exerciseMathVerification.test.js`).
- [x] Production build tested (`npm run build` succeeded cleanly with MediaPipe wasm assets bundled).
- [x] `docker-compose.yml` verified with healthcheck and volume persistence.
- [x] Nginx configuration verified with SSE buffering disabled for AI coach streaming (`proxy_buffering off`) and 6MB limit for camera verification.
