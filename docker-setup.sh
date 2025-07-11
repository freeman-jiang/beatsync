#!/bin/bash

echo "🎵 BeatSync Docker Setup"
echo "======================="

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker and try again."
        exit 1
    fi
    echo "✅ Docker is running"
}

# Function to start MinIO only (for development)
start_dev() {
    echo "🔧 Starting MinIO for development..."
    docker-compose -f docker-compose.dev.yml up -d
    echo ""
    echo "✅ MinIO is starting up!"
    echo "📊 Console: http://localhost:9001 (minioadmin/minioadmin123)"
    echo "🔌 API: http://localhost:9000"
    echo "📦 Bucket: beatsync-audio"
    echo ""
    echo "Update your .env file with these settings:"
    echo "S3_BUCKET_NAME=beatsync-audio"
    echo "S3_PUBLIC_URL=http://localhost:9000/beatsync-audio"
    echo "S3_ENDPOINT=http://localhost:9000"
    echo "S3_ACCESS_KEY_ID=minioadmin"
    echo "S3_SECRET_ACCESS_KEY=minioadmin123"
}

# Function to start full stack
start_full() {
    echo "🚀 Starting full BeatSync stack..."
    docker-compose up -d
    echo ""
    echo "✅ Full stack is starting up!"
    echo "🎵 Client: http://localhost:3000"
    echo "🔧 Server: http://localhost:3001"
    echo "📊 MinIO Console: http://localhost:9001"
}

# Function to stop services
stop_services() {
    echo "🛑 Stopping services..."
    docker-compose -f docker-compose.dev.yml down
    docker-compose down
    echo "✅ Services stopped"
}

# Function to show logs
show_logs() {
    if [ "$1" = "dev" ]; then
        docker-compose -f docker-compose.dev.yml logs -f
    else
        docker-compose logs -f
    fi
}

# Check Docker first
check_docker

# Parse command line arguments
case "$1" in
    "dev")
        start_dev
        ;;
    "full")
        start_full
        ;;
    "stop")
        stop_services
        ;;
    "logs")
        show_logs "$2"
        ;;
    *)
        echo "Usage: $0 {dev|full|stop|logs}"
        echo ""
        echo "Commands:"
        echo "  dev   - Start only MinIO for development"
        echo "  full  - Start full BeatSync stack (MinIO + Server + Client)"
        echo "  stop  - Stop all services"
        echo "  logs  - Show logs (add 'dev' for dev services only)"
        echo ""
        echo "Examples:"
        echo "  $0 dev        # Start MinIO only"
        echo "  $0 full       # Start everything"
        echo "  $0 logs dev   # Show MinIO logs"
        exit 1
        ;;
esac
