# ---------- Stage 1: Build Frontend ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/index.html ./
COPY frontend/vite.config.js ./
COPY frontend/public/ ./public/
COPY frontend/src/ ./src/
COPY frontend/scripts/ ./scripts/

RUN npm run build

# ---------- Stage 2: Runtime Production Image ----------
FROM node:20-alpine
WORKDIR /app

# Install backend production dependencies
COPY backend/package.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source
COPY backend/src/ ./backend/src/
COPY backend/serviceAccountKey*.json ./backend/

# Copy compiled frontend build into public folder for Express to serve
COPY --from=frontend-builder /app/frontend/dist ./backend/public

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["node", "src/server.js"]
