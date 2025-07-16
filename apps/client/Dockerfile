# Use the official Node.js image
FROM node:18-alpine

# Install Bun
RUN npm install -g bun

# Set working directory
WORKDIR /app

# Copy workspace package.json and lock files
COPY package.json bun.lock* ./
COPY apps/client/package.json ./apps/client/
COPY packages/shared/package.json ./packages/shared/

# Copy shared package source
COPY packages/shared ./packages/shared/

# Install dependencies from root (this handles workspace dependencies)
RUN bun install

# Copy client source code
COPY apps/client ./apps/client/

# Set working directory to client
WORKDIR /app/apps/client

# Accept build arguments for environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_NEXT_URL

# Set environment variables from build args
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_NEXT_URL=${NEXT_PUBLIC_NEXT_URL}

# Build the application
RUN bun run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]
