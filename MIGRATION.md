# Beatsync R2 Migration Documentation

This document contains implementation details for the Cloudflare R2 integration that replaced the original filesystem-based audio storage.

## Migration Overview (Completed)

**Date:** 2025-06-15  
**Reason:** Reduce server bandwidth costs on Render by moving audio storage to Cloudflare R2  
**Result:** Zero egress costs + global CDN distribution

## Architecture Changes

### Before (Filesystem Storage)
```
Client → Server (multipart/form-data) → Local filesystem (/uploads/audio/)
Client ← Server (direct file serving) ← Local filesystem
```
- Server handled all file transfers
- Linear bandwidth scaling with users
- Single point of failure
- No CDN distribution

### After (Cloudflare R2)
```
Client → Server (get presigned URL) → R2 API
Client → R2 (direct upload via presigned URL)
Client → Server (upload confirmation)
Client ← R2 Public CDN (direct audio access)
```
- Server only coordinates, no file transfers
- Zero bandwidth costs for audio serving
- Global CDN distribution
- High availability

## Implementation Details

### New Server Endpoints
- `POST /api/upload-url` - Generate presigned upload URLs
- `POST /api/upload-complete` - Confirm successful uploads
- `POST /audio` - Now redirects to R2 public URLs (was direct file serving)
- `POST /upload` - Deprecated with helpful error message

### Key Files Modified
- `apps/server/src/lib/r2.ts` - New R2 utility functions
- `apps/server/src/routes/upload.ts` - Complete rewrite for presigned URL flow
- `apps/server/src/routes/audio.ts` - Changed from file serving to R2 redirects
- `apps/server/src/config.ts` - Added R2 configuration
- `apps/client/src/lib/api.ts` - Updated to 3-step upload process

### Upload Flow Changes

**Old Flow:**
1. Client creates FormData with audio file
2. POST to /upload with multipart/form-data
3. Server saves file to local filesystem
4. Server broadcasts room update via WebSocket

**New Flow:**
1. Client requests presigned URL from server
2. Server generates presigned URL via R2 API
3. Client uploads directly to R2 using presigned URL
4. Client notifies server of successful upload
5. Server broadcasts room update via WebSocket

### Configuration Requirements

```bash
# Required environment variables in apps/server/.env
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
CLOUDFLARE_R2_BUCKET_NAME=beatsync-audio
```

### R2 Bucket Structure
```
beatsync-audio/
├── room-000000/
│   └── 1749916933051.mp3
└── room-232344/
    └── 1745553666739.mp3
```

### Dependencies Added
- `@aws-sdk/client-s3@^3.828.0` - AWS SDK v3 (R2 compatible)

## Cost Analysis

### Before (Server Bandwidth)
- **Upload:** 5MB file = 5MB server bandwidth
- **Distribution:** 5MB × 9 users = 45MB server bandwidth
- **Total per file:** 50MB server bandwidth
- **Monthly cost:** Linear scaling with usage

### After (R2 + CDN)
- **Upload:** Direct to R2, zero server bandwidth
- **Distribution:** R2 CDN, zero egress costs
- **Storage:** ~$0.015 per GB/month
- **Operations:** Minimal costs for API calls
- **Total bandwidth cost:** $0

## Backwards Compatibility

- Old `/upload` endpoint returns deprecation message
- File ID format remains unchanged (`room-{roomId}/{filename}`)
- WebSocket room notifications unchanged
- Client audio fetching flow unchanged (just redirects to R2)

## Testing Considerations

### Local Development
- Requires valid R2 credentials even in development
- Alternative: Mock R2 responses for local testing
- File uploads will go to production R2 bucket

### Production Validation
- Verify R2 bucket public access is configured
- Test upload flow end-to-end
- Monitor R2 usage and costs
- Validate global CDN performance

## Rollback Plan (if needed)

1. Revert `apps/server/src/routes/upload.ts` to original implementation
2. Revert `apps/server/src/routes/audio.ts` to file serving
3. Revert `apps/client/src/lib/api.ts` to FormData upload
4. Remove R2 dependencies and configuration
5. Ensure `/uploads/audio/` directory exists on server

## Future Enhancements

### Potential Optimizations
- Server-side audio transcoding for bandwidth optimization
- Chunked/resumable uploads for large files
- File compression before R2 upload
- Automatic cleanup of old room files

### Monitoring
- R2 usage metrics integration
- Upload success/failure tracking
- CDN performance monitoring
- Cost alerting for R2 usage

## Security Considerations

- Presigned URLs have 1-hour expiration by default
- R2 bucket configured for public read access
- Upload validation maintains audio file type checking
- No sensitive data in audio file metadata

## Performance Impact

### Improvements
- **Global latency:** R2 CDN reduces audio loading times worldwide
- **Server resources:** Eliminated file I/O operations
- **Scalability:** No longer limited by server storage/bandwidth

### Considerations
- Additional network round-trip for presigned URL generation
- Dependency on Cloudflare infrastructure
- Requires internet connectivity for all audio operations

---

*This migration was implemented to address bandwidth cost scaling issues on Render while improving global performance and reliability.*