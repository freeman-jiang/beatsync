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