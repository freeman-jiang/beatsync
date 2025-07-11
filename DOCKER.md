# BeatSync Docker Setup

## Quick Start

1. **Start MinIO for development:**
   ```bash
   docker-setup.bat dev           # Windows
   ./docker-setup.sh dev          # Linux/Mac
   ```

2. **Upload default audio files:**
   ```bash
   cd apps/server
   bun run upload:defaults
   ```

3. **Start your server and client locally:**
   ```bash
   cd apps/server && bun run dev  # Terminal 1
   cd apps/client && npm run dev  # Terminal 2
   ```

**OR start the full stack in Docker:**
   ```bash
   docker-setup.bat full          # Windows
   ./docker-setup.sh full         # Linux/Mac
   ```

## Services

### MinIO (Object Storage)
- **Console URL:** http://localhost:9001
- **API URL:** http://localhost:9000
- **Username:** minioadmin
- **Password:** minioadmin123
- **Bucket:** beatsync-audio (auto-created with public download access)

### BeatSync Server
- **URL:** http://localhost:8080 (local dev) or http://localhost:3001 (Docker)
- **Health Check:** http://localhost:8080/stats

### BeatSync Client
- **URL:** http://localhost:3000

## Configuration

The Docker setup uses MinIO as a local S3-compatible object storage. The configuration is automatically set in the Docker environment variables.

### Environment Variables

For local development, the following variables are set:
- `S3_BUCKET_NAME=beatsync-audio`
- `S3_PUBLIC_URL=http://localhost:9000/beatsync-audio`
- `S3_ENDPOINT=http://localhost:9000`
- `S3_ACCESS_KEY_ID=minioadmin`
- `S3_SECRET_ACCESS_KEY=minioadmin123`

### Development vs Production

- **Development:** Uses MinIO (this Docker setup)
- **Production:** Switch to Cloudflare R2 by updating the environment variables

## Useful Commands

### Server commands:
```bash
cd apps/server
bun run test:s3           # Test S3 connection
bun run test:cleanup      # Test cleanup operations
bun run upload:defaults   # Upload default audio files
```

### View MinIO bucket contents:
```bash
docker exec -it beatsync-minio-dev mc ls local/beatsync-audio
```

### Reset MinIO data:
```bash
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
# Then re-upload defaults: bun run upload:defaults
```

### Build specific service:
```bash
docker-compose build server
docker-compose build client
```

### Run without client:
```bash
docker-compose up -d minio minio-create-bucket server
```

## Troubleshooting

### 403 Forbidden errors
If you get 403 errors when accessing audio files:
```bash
docker exec -it beatsync-minio-dev mc anonymous set download local/beatsync-audio
```

### Missing default audio files
If default audio isn't loading:
```bash
cd apps/server
bun run upload:defaults
```

### Port conflicts
Make sure ports 3000, 3001, 8080, 9000, and 9001 are not in use

### Connection issues
1. Check if MinIO is running: `docker ps`
2. Test MinIO health: `curl http://localhost:9000/minio/health/live`
3. Test S3 connection: `cd apps/server && bun run test:s3`

## Default Audio Files

Default audio files are automatically uploaded to MinIO and served via the `/default` endpoint:
- URL pattern: `http://localhost:9000/beatsync-audio/default/{filename}`
- Available via API: `http://localhost:8080/default`

To add new default audio files:
1. Add files to `apps/client/public/`
2. Update the upload script in `apps/server/src/lib/upload-defaults.ts`
3. Run `bun run upload:defaults`
