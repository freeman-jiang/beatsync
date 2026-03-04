# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beatsync is a high-precision web audio player for multi-device synchronized playback. Turborepo monorepo with three packages:

- **`apps/client`**: Next.js 15 (App Router, React 19, Tailwind v4, Shadcn/ui)
- **`apps/server`**: Bun HTTP + WebSocket server (native `Bun.serve`, not Hono routing)
- **`packages/shared`**: Zod schemas shared across client/server (`@beatsync/shared`)

## Commands

```bash
bun install              # Install all dependencies (run from root)
bun dev                  # Start both client and server (Turborepo)
bun client               # Client only (port 3000)
bun server               # Server only (port 8080)
bun build                # Build all packages

# Server-specific (run from apps/server/)
bun test                 # Run tests (Bun test runner)
bun test --watch         # Watch mode
bun run cleanup          # Dry-run orphaned R2 room cleanup
bun run cleanup:live     # Delete orphaned R2 rooms
bun run type-check       # tsc --noEmit

# Client-specific (run from apps/client/)
bun lint                 # next lint
```

## Architecture

### Server Manager Hierarchy

The server uses a manager pattern with in-memory state (no database):

- **`GlobalManager`** (singleton): Manages all rooms. Accessed via `GlobalManager.rooms`. Caches active user count with dirty flag.
- **`RoomManager`** (per-room): Owns clients, audio sources, playback state, spatial audio config, chat. Handles audio loading coordination and synchronized play scheduling.
- **`ChatManager`** (per-room, owned by RoomManager): Message history with incremental IDs.
- **`BackupManager`** (singleton): Periodic state backup/restore to R2 (every 60s). Restores on startup.
- **`MusicProviderManager`**: External music search and streaming integration.

### WebSocket Protocol

All WebSocket messages are validated with Zod discriminated unions. The flow:

1. Client connects → `handleOpen()` subscribes to room topic, sends initial room state
2. Incoming messages validated against `WSRequestSchema` → dispatched via `WebsocketRegistry` (type-safe handler map in `apps/server/src/websocket/registry.ts`)
3. Each handler is a separate file in `apps/server/src/websocket/handlers/`
4. Server responses are three categories defined in `packages/shared/types/`:
   - **`WSBroadcast`**: Sent to all room clients (room events, scheduled actions, stream updates)
   - **`WSUnicast`**: Sent to a single client (NTP responses, search results)
   - **`WSResponse`**: Union of broadcast + unicast

Adding a new WebSocket message type requires: adding to `ClientActionEnum` in `packages/shared/types/WSRequest.ts`, creating a schema, adding a handler file, and registering it in the registry.

### Time Synchronization

NTP-inspired protocol for millisecond-accurate cross-device playback:
- Client sends `NTP_REQUEST` with `t0` → server stamps `t1`/`t2` → client receives at `t3`
- Exponential moving average smoothing (α=0.2) for RTT estimation
- Minimum 10 measurements before "synced" state
- Play/pause commands are **scheduled actions**: server broadcasts `serverTimeToExecute` and clients execute at that synchronized moment, using max client RTT to calculate delay

### Audio Pipeline

Three-step upload flow (client uploads directly to R2, no server bandwidth used):
1. `POST /upload/get-presigned-url` → server generates presigned R2 PUT URL
2. Client PUTs file directly to R2
3. `POST /upload/complete` → server adds to room's audio sources, broadcasts update

R2 key structure: `room-{roomId}/{sanitized-name}☆{timestamp}.{ext}`

Utilities: `apps/server/src/lib/r2.ts` (presigned URLs, public URLs, batch delete, orphan cleanup), `apps/server/src/utils/responses.ts` (CORS headers, error/success response helpers).

### Client State Management

Three Zustand stores in `apps/client/src/store/`:
- **`global.tsx`**: Main store (~1500 lines). Audio sources, WebSocket connection, NTP sync state, spatial audio, playback state, volume, search results, stream jobs. Uses LRU buffer cache (max 3 audio buffers).
- **`room.tsx`**: Room metadata (roomId, username, loading state)
- **`chat.tsx`**: Chat messages

HTTP data fetching uses Axios + TanStack React Query. WebSocket message utilities in `apps/client/src/utils/ws.ts`.

### Audio Loading Coordination

When play is requested, the server doesn't immediately schedule playback. Instead:
1. Server broadcasts `LOAD_AUDIO_SOURCE` to all clients
2. Clients load/decode the audio and respond with `AUDIO_SOURCE_LOADED`
3. Server waits for all clients (or 3s timeout) then schedules synchronized play

### Spatial Audio

Grid-based positioning system where clients are placed on a grid. A "listening source" position determines gain per client using distance calculations. Server broadcasts spatial gain config at 100ms intervals. Client applies: `effectiveGain = globalVolume × spatialGain`.

## Environment Setup

`apps/client/.env`:
```
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
```

`apps/server/.env`:
```
S3_BUCKET_NAME=
S3_PUBLIC_URL=
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

## Deployment

- **Docker**: Multi-stage build with `oven/bun:1`. Exposes port 8080. Entry: `bun start`.
- **PM2**: Config in `pm2.config.js`. Process name: `beatsync-server`.
- Server has graceful shutdown (SIGTERM/SIGINT) that backs up state to R2 before exit.

## Development Notes

- No testing framework on the client; server uses `bun test` with sinon for stubs
- Server uses native `Bun.serve()` with URL pathname switch routing (not Hono's router)
- Room IDs are 6-digit codes
- Room cleanup: 60s after last client disconnects, room is deleted
- Admin auto-promotion: if last admin leaves, a random client is promoted
