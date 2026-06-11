# Stage 1: Dependencies - install production deps
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json ./

# Copy package files maintaining workspace structure
COPY apps/server/package.json ./apps/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# --ignore-scripts: the root prepare script runs lefthook (a devDependency,
# absent under --production install) and git hooks have no place in a container
RUN bun install --production --ignore-scripts

# Stage 2: Build - bundle the server (bun start runs dist/index.js)
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app /app
COPY apps/server/src ./apps/server/src
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY packages/shared ./packages/shared
WORKDIR /app/apps/server
RUN bun run build

# Stage 3: Runner - final production image (self-contained bundle, no node_modules)
FROM oven/bun:1-slim AS runner
WORKDIR /app/apps/server

COPY --from=build /app/apps/server/dist ./dist

EXPOSE 8080
ENV NODE_ENV=production
CMD ["bun", "dist/index.js"]
