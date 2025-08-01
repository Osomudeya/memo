#!/bin/bash

# Humor Memory Game - Deployment Script
# Automated deployment for different environments

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
ENVIRONMENT="${1:-development}"
VERSION="${2:-latest}"

# Docker configuration
DOCKER_REGISTRY="${DOCKER_REGISTRY:-ghcr.io/your-org}"
IMAGE_NAME="humor-memory-game"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"

# Kubernetes configuration
KUBE_NAMESPACE="humor-game-${ENVIRONMENT}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

# Function to print colored output
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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check for required tools
    command -v docker >/dev/null 2>&1 || missing_tools+=("docker")
    command -v docker-compose >/dev/null 2>&1 || missing_tools+=("docker-compose")
    
    if [[ "$ENVIRONMENT" == "production" || "$ENVIRONMENT" == "staging" ]]; then
        command -v kubectl >/dev/null 2>&1 || missing_tools+=("kubectl")
        command -v helm >/dev/null 2>&1 || missing_tools+=("helm")
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    # Check if .env file exists
    if [[ ! -f "${PROJECT_ROOT}/.env" ]]; then
        print_warning ".env file not found, copying from .env.example"
        cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"
        print_warning "Please update .env file with appropriate values"
    fi
    
    print_success "Prerequisites check completed"
}

# Function to build Docker images
build_images() {
    print_status "Building Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Build the main application image
    docker build -t "${IMAGE_NAME}:${VERSION}" .
    docker build -t "${IMAGE_NAME}:latest" .
    
    # Tag for registry if pushing
    if [[ -n "${DOCKER_REGISTRY}" ]]; then
        docker tag "${IMAGE_NAME}:${VERSION}" "${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION}"
        docker tag "${IMAGE_NAME}:latest" "${DOCKER_REGISTRY}/${IMAGE_NAME}:latest"
    fi
    
    print_success "Docker images built successfully"
}

# Function to push images to registry
push_images() {
    if [[ -z "${DOCKER_REGISTRY}" ]]; then
        print_warning "DOCKER_REGISTRY not set, skipping image push"
        return
    fi
    
    print_status "Pushing images to registry..."
    
    # Login to registry if credentials are available
    if [[ -n "${DOCKER_USERNAME:-}" && -n "${DOCKER_PASSWORD:-}" ]]; then
        echo "$DOCKER_PASSWORD" | docker login "$DOCKER_REGISTRY" -u "$DOCKER_USERNAME" --password-stdin
    fi
    
    docker push "${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION}"
    docker push "${DOCKER_REGISTRY}/${IMAGE_NAME}:latest"
    
    print_success "Images pushed to registry"
}

# Function to deploy using Docker Compose (development)
deploy_compose() {
    print_status "Deploying with Docker Compose..."
    
    cd "$PROJECT_ROOT"
    
    # Stop existing services
    docker-compose down
    
    # Pull latest images if using registry
    if [[ -n "${DOCKER_REGISTRY}" ]]; then
        docker-compose pull
    fi
    
    # Start services
    docker-compose up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to start..."
    sleep 10
    
    # Health check
    for i in {1..30}; do
        if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
            print_success "Application is healthy"
            break
        fi
        sleep 2
        if [[ $i -eq 30 ]]; then
            print_error "Application failed to start"
            docker-compose logs app
            exit 1
        fi
    done
    
    print_success "Docker Compose deployment completed"
}

# Function to deploy to Kubernetes
deploy_kubernetes() {
    print_status "Deploying to Kubernetes..."
    
    # Set kubectl context if provided
    if [[ -n "$KUBE_CONTEXT" ]]; then
        kubectl config use-context "$KUBE_CONTEXT"
    fi
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$KUBE_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply configurations
    cd "${PROJECT_ROOT}/k8s"
    
    # Replace placeholder values in manifests
    export IMAGE_TAG="$VERSION"
    export NAMESPACE="$KUBE_NAMESPACE"
    export ENVIRONMENT="$ENVIRONMENT"
    
    # Process and apply manifests
    for manifest in *.yaml; do
        envsubst < "$manifest" | kubectl apply -n "$KUBE_NAMESPACE" -f -
    done
    
    # Wait for deployment to complete
    print_status "Waiting for deployment to complete..."
    kubectl rollout status deployment/humor-game-app -n "$KUBE_NAMESPACE" --timeout=300s
    kubectl rollout status deployment/postgres -n "$KUBE_NAMESPACE" --timeout=300s
    kubectl rollout status deployment/redis -n "$KUBE_NAMESPACE" --timeout=300s
    
    # Get service information
    kubectl get services -n "$KUBE_NAMESPACE"
    
    print_success "Kubernetes deployment completed"
}

# Function to run database migrations
run_migrations() {
    print_status "Running database migrations..."
    
    if [[ "$ENVIRONMENT" == "development" ]]; then
        # Run migrations via Docker Compose
        docker-compose exec app npm run db:migrate
    else
        # Run migrations via Kubernetes job
        kubectl create job --from=cronjob/db-migration migration-$(date +%s) -n "$KUBE_NAMESPACE"
    fi
    
    print_success "Database migrations completed"
}

# Function to run smoke tests
run_smoke_tests() {
    print_status "Running smoke tests..."