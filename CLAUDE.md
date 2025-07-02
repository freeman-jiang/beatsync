# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beatsync is a high-precision web audio player built for multi-device synchronized playback. It's a monorepo using Turborepo with:

- **Frontend**: Next.js 15 React app with TypeScript, Tailwind CSS, and Shadcn/ui
- **Backend**: Bun HTTP + WebSocket server using Hono framework
- **Shared Package**: Type-safe schemas using Zod shared between client and server

## Common Development Commands

```bash
# Install dependencies (run from root)
bun install

# Start both client and server in development
bun dev

# Start only the client (port 3000)
bun client

# Start only the server (port 8080)
bun server

# Build all applications
bun build

# Lint the client code
cd apps/client && bun lint
```

## Architecture

### Time Synchronization

The core feature uses NTP-inspired primitives for millisecond-accurate synchronization across devices. The synchronization logic is implemented in:

- Client: `apps/client/src/lib/sync.ts`
- Server coordination via WebSocket connections

### State Management

- **Client State**: Zustand stores in `apps/client/src/stores/`
  - `usePlayerStore`: Audio playback state
  - `useServerStore`: Server connection and room state
  - `useUserStore`: User preferences and device info

### API Communication

- **HTTP API**: Axios client with React Query for data fetching
- **WebSocket**: Real-time communication for synchronization
- **Type Safety**: Shared Zod schemas in `packages/shared` ensure type safety across client/server boundary

### Key Client Components

- `apps/client/src/components/audio/`: Audio player and controls
- `apps/client/src/components/room/`: Room management UI
- `apps/client/src/hooks/`: Custom React hooks for player logic

### Server Architecture

- Entry point: `apps/server/src/index.ts`
- WebSocket handler manages room state and synchronization
- In-memory storage (no database currently)
- **Audio Storage**: Cloudflare R2 with direct client uploads (see `MIGRATION.md` for details)

## Environment Setup

Create `.env` file in `apps/client/`:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

Create `.env` file in `apps/server/`:

```bash
# Cloudflare R2 Configuration (required for audio uploads)
S3_BUCKET_NAME=
S3_PUBLIC_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

### Setting up Cloudflare R2:

1. **Create R2 Bucket:**

   - Go to Cloudflare Dashboard → R2 Object Storage
   - Create a new bucket named `beatsync-audio` (or customize in env vars)
   - Enable public access for the bucket domain

2. **Generate R2 API Tokens:**

   - Go to Cloudflare Dashboard → Manage Account → API Tokens → R2 Tokens
   - Create new R2 token with "Admin Read & Write" permissions
   - Save the Access Key ID and Secret Access Key

3. **Get Account ID:**
   - Found in the right sidebar of your Cloudflare Dashboard

## Development Notes

- The project uses Bun as the package manager and runtime
- Client uses Next.js App Router with React Server Components
- No testing framework is currently set up
- Mobile support is experimental
- Chrome is recommended for best audio performance
