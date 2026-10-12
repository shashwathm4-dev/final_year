# ---------- Stage 1: Build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Install ALL dependencies (including devDependencies needed for the build)
COPY package.json ./
RUN npm install

# Copy source and build assets
COPY index.html ./
COPY vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/
COPY scripts/ ./scripts/

# Build the production bundle
RUN npm run build

# ---------- Stage 2: Serve with nginx ----------
FROM nginx:stable-alpine

# Copy the built files
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config that proxies /api to the backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
