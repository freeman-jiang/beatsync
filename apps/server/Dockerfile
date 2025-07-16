# Use the official Bun image
FROM oven/bun:1.2.18-alpine

# Set working directory
WORKDIR /app

# Copy workspace package.json and lock files
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# Copy shared package source
COPY packages/shared ./packages/shared/

# Install dependencies from root (this handles workspace dependencies)
RUN bun install

# Copy server source code
COPY apps/server ./apps/server/

# Set working directory to server
WORKDIR /app/apps/server

# Build the application
RUN bun run build

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["bun", "run", "start"]
