#!/bin/bash

# Taboo Game - Local one-click start (no Discord Activity, no tunnel)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

install_nodejs() {
    echo -e "${YELLOW}Installing Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
}

install_dependencies() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    cd frontend
    npm install
    cd ..
}

build_frontend() {
    echo -e "${YELLOW}Building frontend...${NC}"
    cat > frontend/.env.local << EOF
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
EOF
    cd frontend
    npm run build
    cd ..
}

if ! command_exists node; then
    echo -e "${RED}Node.js is not installed.${NC}"
    read -p "Install Node.js now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_nodejs
    else
        echo -e "${RED}Node.js is required. Exiting.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}? Node.js version: $(node -v)${NC}"

install_dependencies
build_frontend

echo -e "${YELLOW}Cleaning up existing processes...${NC}"
pkill -f "node server.js" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
sleep 2

echo -e "${YELLOW}Starting backend server on port 3001...${NC}"
PORT=3001 node server.js > backend.log 2>&1 &
BACKEND_PID=$!

echo -e "${YELLOW}Starting frontend server on port 3000...${NC}"
cd frontend
PORT=3000 npm start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

cat > .deployment.pid << EOF
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
EOF

cat > stop.sh << 'STOP_SCRIPT'
#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Stopping Taboo Game services...${NC}"

if [ -f .deployment.pid ]; then
    source .deployment.pid
    [ ! -z "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null && echo -e "${GREEN}? Backend stopped${NC}" || true
    [ ! -z "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null && echo -e "${GREEN}? Frontend stopped${NC}" || true
    rm .deployment.pid
else
    pkill -f "node server.js" 2>/dev/null || true
    pkill -f "next start" 2>/dev/null || true
fi

rm -f backend.log frontend.log

echo -e "${GREEN}All services stopped.${NC}"
STOP_SCRIPT

chmod +x stop.sh

echo ""
echo -e "${GREEN}Deployment successful.${NC}"
echo -e "Frontend: ${GREEN}http://localhost:3000${NC}"
echo -e "Backend:  ${GREEN}http://localhost:3001${NC}"
echo -e "Run ${GREEN}./stop.sh${NC} to stop services."
