FROM node:20-slim

WORKDIR /app

# Install only production dependencies. No native addons required —
# @neondatabase/serverless is pure JS over HTTPS.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy backend, api, db, and frontend layers
COPY backend ./backend
COPY api ./api
COPY db ./db
COPY frontend ./frontend

EXPOSE 10000

CMD ["node", "backend/server.js"]
