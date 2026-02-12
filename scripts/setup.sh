#!/usr/bin/env bash
set -euo pipefail

# MyPA — First-run setup script
# Generates .env from template and starts Docker Compose.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  __  __       ____    _    "
echo " |  \/  |_   _|  _ \  / \   "
echo " | |\/| | | | | |_) |/ _ \  "
echo " | |  | | |_| |  __// ___ \ "
echo " |_|  |_|\__, |_|  /_/   \_\\"
echo "         |___/               "
echo -e "${NC}"
echo "Open-source AI-powered team communication"
echo ""

# Generate .env if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from template...${NC}"
    cp .env.example .env

    # Generate a random JWT_SECRET
    JWT_SECRET=$(openssl rand -hex 32)

    # macOS sed needs different syntax than GNU sed
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/change-me-to-a-random-string/$JWT_SECRET/" .env
    else
        sed -i "s/change-me-to-a-random-string/$JWT_SECRET/" .env
    fi

    echo -e "${GREEN}Created .env with generated JWT_SECRET${NC}"
else
    echo -e "${GREEN}.env already exists, using existing config${NC}"
fi

# Create data directories
mkdir -p data/backend data/relay data/pa-workspace

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required but not installed."
    echo "Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose V2 is required."
    echo "Install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo ""
echo "Building and starting services..."
echo ""

docker compose up -d --build

echo ""
echo -e "${GREEN}MyPA is running!${NC}"
echo ""
echo "  Canvas:  http://localhost"
echo "  Backend: http://localhost:3001/health"
echo "  Relay:   http://localhost:3002/health"
echo ""
echo "Open http://localhost and register your first account."
echo "The first registered user can invite others from Settings."
echo ""
echo -e "Stop: ${CYAN}docker compose down${NC}"
echo -e "Logs: ${CYAN}docker compose logs -f${NC}"
echo ""
