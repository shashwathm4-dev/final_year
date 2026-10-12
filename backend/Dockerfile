FROM node:20-alpine

WORKDIR /app

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy application source
COPY src/ ./src/
COPY serviceAccountKey*.json ./

# Expose the backend port
EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "src/server.js"]
