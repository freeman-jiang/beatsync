# Stage 1: Dependencies - install production deps
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json ./

# Copy package files maintaining workspace structure
COPY apps/server/package.json ./apps/server/package.json  
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --production

# Stage 2: Runner - final production image
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Install system dependencies for YouTube download functionality
RUN apt-get update && apt-get install -y \
    curl \
    xz-utils \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

# Download and install yt-dlp binary (requires Python3 runtime)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# Download and install static ffmpeg binaries
RUN curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz \
    && tar -xf /tmp/ffmpeg.tar.xz -C /tmp \
    && cp /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ \
    && cp /tmp/ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ \
    && chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe \
    && rm -rf /tmp/ffmpeg*

# Verify installations work and test basic functionality
RUN yt-dlp --version && ffmpeg -version \
    && echo "Testing yt-dlp basic functionality..." \
    && yt-dlp --help > /dev/null \
    && echo "yt-dlp basic test passed"

# Copy installed dependencies
COPY --from=deps /app /app

# Copy source code to proper locations
COPY apps/server/src ./apps/server/src
COPY packages/shared ./packages/shared

# Set working directory to server app
WORKDIR /app/apps/server

EXPOSE 8080
ENV NODE_ENV=production
CMD ["bun", "start"]