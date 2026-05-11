FROM node:20-slim

# Install build tools required for better-sqlite3 native C++ compilation
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies (build_from_source=true in .npmrc forces node-gyp compilation)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Copy application code
COPY backend ./backend

EXPOSE 10000

CMD ["node", "backend/server.js"]
