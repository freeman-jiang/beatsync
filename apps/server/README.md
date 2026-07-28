To install dependencies:
```sh
bun install
```

Create the server environment file:

```sh
cp .env.example .env
```

Local filesystem storage is enabled by default:

```env
STORAGE_MODE=local
LOCAL_STORAGE_PATH=./data
LOCAL_PUBLIC_URL=http://localhost:8080
```

This stores uploaded audio and room-state backups under `apps/server/data` when the server is run from this
workspace. For LAN access, set `LOCAL_PUBLIC_URL` to `http://SERVER_LAN_IP:8080`.

To use R2 or another S3-compatible service, set `STORAGE_MODE=s3` and configure `S3_BUCKET_NAME`, `S3_PUBLIC_URL`,
`S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.

To run:
```sh
bun run dev
```

The HTTP and WebSocket server listens on http://localhost:8080.
