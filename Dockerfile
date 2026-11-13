FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy application source code (excluding .dockerignore items)
COPY . .

# Build Vite single-page frontend into dist/
RUN npm run build

# Default port for Render
ENV PORT=10000
EXPOSE 10000

# Start the unified frontend & backend server
CMD ["node", "server.js"]
