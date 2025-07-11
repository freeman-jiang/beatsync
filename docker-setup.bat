@echo off
setlocal

echo 🎵 BeatSync Docker Setup
echo =======================

REM Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker and try again.
    exit /b 1
)
echo ✅ Docker is running

if "%1"=="dev" goto start_dev
if "%1"=="full" goto start_full
if "%1"=="stop" goto stop_services
if "%1"=="logs" goto show_logs
goto usage

:start_dev
echo 🔧 Starting MinIO for development...
docker-compose -f docker-compose.dev.yml up -d
echo.
echo ✅ MinIO is starting up!
echo 📊 Console: http://localhost:9001 (minioadmin/minioadmin123)
echo 🔌 API: http://localhost:9000
echo 📦 Bucket: beatsync-audio
echo.
echo Update your .env file with these settings:
echo S3_BUCKET_NAME=beatsync-audio
echo S3_PUBLIC_URL=http://localhost:9000/beatsync-audio
echo S3_ENDPOINT=http://localhost:9000
echo S3_ACCESS_KEY_ID=minioadmin
echo S3_SECRET_ACCESS_KEY=minioadmin123
goto end

:start_full
echo 🚀 Starting full BeatSync stack...
docker-compose up -d
echo.
echo ✅ Full stack is starting up!
echo 🎵 Client: http://localhost:3000
echo 🔧 Server: http://localhost:3001
echo 📊 MinIO Console: http://localhost:9001
goto end

:stop_services
echo 🛑 Stopping services...
docker-compose -f docker-compose.dev.yml down
docker-compose down
echo ✅ Services stopped
goto end

:show_logs
if "%2"=="dev" (
    docker-compose -f docker-compose.dev.yml logs -f
) else (
    docker-compose logs -f
)
goto end

:usage
echo Usage: %0 {dev^|full^|stop^|logs}
echo.
echo Commands:
echo   dev   - Start only MinIO for development
echo   full  - Start full BeatSync stack (MinIO + Server + Client)
echo   stop  - Stop all services
echo   logs  - Show logs (add 'dev' for dev services only)
echo.
echo Examples:
echo   %0 dev        # Start MinIO only
echo   %0 full       # Start everything
echo   %0 logs dev   # Show MinIO logs

:end
endlocal
