FROM node:20-slim

# Install build tools required for better-sqlite3 native C++ compilation
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Force better-sqlite3 to compile from source (skip prebuild-install downloads)
ENV npm_config_build_from_source=true

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY backend ./backend

EXPOSE 10000

CMD ["node", "backend/server.js"]
