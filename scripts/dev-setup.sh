#!/bin/bash

# Humor Memory Game - Development Setup Script
# Quick setup for separated frontend/backend development

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}🎮 HUMOR MEMORY GAME - DEV SETUP 😂${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check for required tools
    command -v docker >/dev/null 2>&1 || missing_tools+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing_tools+=("docker-compose")
    command -v node >/dev/null 2>&1 || missing_tools+=("node")
    command -v npm >/dev/null 2>&1 || missing_tools+=("npm")
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_error "Please install the missing tools and run this script again."
        exit 1
    fi
    
    # Check Node.js version
    local node_version=$(node --version | sed 's/v//')
    local required_version="18.0.0"
    
    if ! printf '%s\n%s\n' "$required_version" "$node_version" | sort -V -C; then
        print_warning "Node.js version $node_version detected. Recommended: >= $required_version"
    fi
    
    print_success "Prerequisites check completed"
}

setup_environment() {
    print_status "Setting up environment configuration..."
    
    cd "$PROJECT_ROOT"
    
    # Copy environment file if it doesn't exist
    if [[ ! -f ".env" ]]; then
        cp .env.example .env
        print_success "Created .env file from .env.example"
        print_warning "Please review and update .env file with your configurations"
    else
        print_status ".env file already exists"
    fi
}

install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install backend dependencies
    print_status "Installing backend dependencies..."
    cd "$PROJECT_ROOT/backend"
    npm install
    print_success "Backend dependencies installed"
    
    # Install frontend dependencies (minimal for vanilla JS)
    print_status "Installing frontend dependencies..."
    cd "$PROJECT_ROOT/frontend"
    npm install
    print_success "Frontend dependencies installed"
}

setup_database() {
    print_status "Setting up database..."
    
    cd "$PROJECT_ROOT"
    
    # Start database services only
    print_status "Starting PostgreSQL and Redis..."
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose exec -T postgres pg_isready -U gameuser -d humor_memory_game >/dev/null 2>&1; then
            print_success "Database is ready!"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            print_error "Database failed to start after $max_attempts attempts"
            exit 1
        fi
        
        print_status "Waiting for database... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    # Verify Redis
    if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
        print_success "Redis is ready!"
    else
        print_error "Redis failed to start"
        exit 1
    fi
}

start_development_servers() {
    print_status "Starting development servers..."
    
    cd "$PROJECT_ROOT"
    
    # Create log directory
    mkdir -p logs
    
    # Start backend in background
    print_status "Starting backend server..."
    cd backend
    npm run dev > ../logs/backend.log 2>&1 &
    local backend_pid=$!
    echo $backend_pid > ../logs/backend.pid
    cd ..
    
    # Wait a moment for backend to start
    sleep 3
    
    # Check if backend started successfully
    if ! kill -0 $backend_pid 2>/dev/null; then
        print_error "Backend server failed to start. Check logs/backend.log"
        exit 1
    fi
    
    # Start frontend in background
    print_status "Starting frontend server..."
    cd frontend
    npm run dev > ../logs/frontend.log 2>&1 &
    local frontend_pid=$!
    echo $frontend_pid > ../logs/frontend.pid
    cd ..
    
    # Wait a moment for frontend to start
    sleep 2
    
    # Check if frontend started successfully
    if ! kill -0 $frontend_pid 2>/dev/null; then
        print_error "Frontend server failed to start. Check logs/frontend.log"
        exit 1
    fi
    
    print_success "Development servers started!"
    print_success "Backend API: http://localhost:3001"
    print_success "Frontend App: http://localhost:8080"
    print_success "Full Stack: http://localhost:3000 (via Docker Compose)"
}

create_stop_script() {
    print_status "Creating stop script..."
    
    cd "$PROJECT_ROOT"
    
    cat > scripts/stop-dev.sh << 'EOF'
#!/bin/bash

# Stop development servers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🛑 Stopping development servers..."

# Stop backend
if [[ -f "$PROJECT_ROOT/logs/backend.pid" ]]; then
    backend_pid=$(cat "$PROJECT_ROOT/logs/backend.pid")
    if kill -0 $backend_pid 2>/dev/null; then
        kill $backend_pid
        echo "✅ Backend server stopped"
    fi
    rm -f "$PROJECT_ROOT/logs/backend.pid"
fi

# Stop frontend
if [[ -f "$PROJECT_ROOT/logs/frontend.pid" ]]; then
    frontend_pid=$(cat "$PROJECT_ROOT/logs/frontend.pid")
    if kill -0 $frontend_pid 2>/dev/null; then
        kill $frontend_pid
        echo "✅ Frontend server stopped"
    fi
    rm -f "$PROJECT_ROOT/logs/frontend.pid"
fi

# Stop Docker services
cd "$PROJECT_ROOT"
docker-compose down
echo "✅ Docker services stopped"

echo "🎮 Development environment stopped!"
EOF

    chmod +x scripts/stop-dev.sh
    print_success "Created scripts/stop-dev.sh"
}

test_application() {
    print_status "Testing application..."
    
    # Test backend API
    local max_attempts=10
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
            print_success "Backend API is responding"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            print_error "Backend API failed to respond after $max_attempts attempts"
            print_error "Check logs/backend.log for details"
            exit 1
        fi
        
        print_status "Testing backend API... (attempt $attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    # Test frontend
    if curl -sf http://localhost:8080 >/dev/null 2>&1; then
        print_success "Frontend is responding"
    else
        print_warning "Frontend might not be ready yet. Check logs/frontend.log"
    fi
}

show_summary() {
    print_header
    print_success "🎉 Development environment setup complete!"
    echo
    print_status "🌐 Access Points:"
    echo "   Frontend (Dev):     http://localhost:8080"
    echo "   Backend API:        http://localhost:3001"
    echo "   Full Stack:         http://localhost:3000"
    echo "   API Documentation:  http://localhost:3001/api"
    echo "   Health Check:       http://localhost:3001/health"
    echo
    print_status "🗄️ Database Access:"
    echo "   PostgreSQL:         localhost:5432"
    echo "   Redis:              localhost:6379"
    echo
    print_status "📋 Useful Commands:"
    echo "   Stop servers:       ./scripts/stop-dev.sh"
    echo "   View backend logs:  tail -f logs/backend.log"
    echo "   View frontend logs: tail -f logs/frontend.log"
    echo "   Restart services:   docker-compose restart"
    echo
    print_status "🎮 Ready to start coding!"
    print_status "Make changes to frontend/src or backend/ and they'll auto-reload!"
    echo
}

main() {
    print_header
    
    check_prerequisites
    setup_environment
    install_dependencies
    setup_database
    start_development_servers
    create_stop_script
    test_application
    show_summary
}

# Handle script interruption
trap 'print_error "Setup interrupted"; exit 1' INT TERM

# Run main function
main "$@"