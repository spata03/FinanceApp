FROM node:20-slim

# Install build tools as fallback for native addon compilation
RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy backend code
COPY backend ./backend

# Copy frontend static files (served directly by the backend)
COPY index.html ./
COPY src ./src
COPY assets ./assets
COPY sw.js ./
COPY manifest.webmanifest ./

EXPOSE 10000

CMD ["node", "backend/server.js"]
