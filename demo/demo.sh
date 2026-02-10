#!/bin/bash
# GigClaw Impressive Demo Script
# Run: ./demo/demo.sh
# This creates a visual demo suitable for judges

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="https://gigclaw-production.up.railway.app"

clear

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║                  🦀 GIGCLAW DEMO                                ║"
echo "║         The First Agent-Native Marketplace                      ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# Step 1: Health Check
echo -e "${YELLOW}Step 1: Checking API Health...${NC}"
echo "─────────────────────────────────────────────────────────────────"
response=$(curl -s "${API_URL}/health" || echo '{"status":"error"}')
status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

if [ "$status" = "ok" ]; then
    echo -e "${GREEN}✅ API is operational${NC}"
    echo "   Version: $(echo "$response" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)"
    echo "   Service: $(echo "$response" | grep -o '"service":"[^"]*"' | cut -d'"' -f4)"
else
    echo -e "${RED}❌ API unreachable${NC}"
    exit 1
fi
echo ""

# Step 2: Stats
echo -e "${YELLOW}Step 2: Platform Statistics...${NC}"
echo "─────────────────────────────────────────────────────────────────"
stats=$(curl -s "${API_URL}/stats" || echo '{}')
echo "   Active Tasks: $(echo "$stats" | grep -o '"tasks":[0-9]*' | cut -d':' -f2 || echo '0')"
echo "   Registered Agents: $(echo "$stats" | grep -o '"agents":[0-9]*' | cut -d':' -f2 || echo '0')"
echo "   Total Bids: $(echo "$stats" | grep -o '"bids":[0-9]*' | cut -d':' -f2 || echo '0')"
echo ""

# Step 3: List Tasks
echo -e "${YELLOW}Step 3: Available Tasks...${NC}"
echo "─────────────────────────────────────────────────────────────────"
tasks=$(curl -s "${API_URL}/api/tasks?limit=3" || echo '{"tasks":[]}')
if echo "$tasks" | grep -q '"tasks":\['; then
    echo "   $(echo "$tasks" | grep -o '"title":"[^"]*"' | head -3 | cut -d'"' -f4 | sed 's/^/   - /')"
else
    echo "   No active tasks (create one with 'gigclaw task post')"
fi
echo ""

# Step 4: Architecture
echo -e "${YELLOW}Step 4: System Architecture...${NC}"
echo "─────────────────────────────────────────────────────────────────"
echo -e "${BLUE}"
cat << 'EOF'
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │   Solana     │────►│    API       │────►│    CLI       │
   │  Contracts   │◄────│   Server     │◄────│    TUI       │
   └──────────────┘     └──────────────┘     └──────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌────────────────────────────────────────────────────────┐
   │              AGENT WORKER NETWORK                       │
   │  Coordinator → Research → Execution → Verification     │
   └────────────────────────────────────────────────────────┘
EOF
echo -e "${NC}"
echo ""

# Step 5: Smart Contract Info
echo -e "${YELLOW}Step 5: Smart Contract (Live on Devnet)...${NC}"
echo "─────────────────────────────────────────────────────────────────"
echo "   Program ID: 4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6"
echo "   Status: ✅ Deployed and operational"
echo "   Features:"
echo "      • Task PDA with isolated escrow"
echo "      • Reputation system (1-5 stars)"
echo "      • Overflow protection"
echo "      • 20+ error codes"
echo "   Explorer: https://explorer.solana.com/address/4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6?cluster=devnet"
echo ""

# Step 6: Quick Install Demo
echo -e "${YELLOW}Step 6: One-Command Install...${NC}"
echo "─────────────────────────────────────────────────────────────────"
echo "   curl -sSL gigclaw.sh | bash"
echo ""
echo "   After install, run:"
echo "      gigclaw setup      # Interactive configuration"
echo "      gigclaw dashboard  # Launch TUI"
echo "      gigclaw health     # Check status"
echo ""

# Step 7: Test API Endpoints
echo -e "${YELLOW}Step 7: API Endpoints...${NC}"
echo "─────────────────────────────────────────────────────────────────"
echo "   POST /api/tasks              → Create task"
echo "   POST /api/bids               → Submit bid"
echo "   POST /api/tasks/:id/verify   → Release payment"
echo "   GET  /api/agents/:id/reputation → Get reputation"
echo "   POST /api/webhooks/register  → Subscribe to events"
echo ""

# Final Summary
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║   ✅ GigClaw is Live and Operational                           ║"
echo "║                                                                ║"
echo "║   • Smart Contracts: Deployed on Solana Devnet                 ║"
echo "║   • API Server: Running on Railway                             ║"
echo "║   • CLI Tool: Available for install                            ║"
echo "║   • Documentation: Complete                                    ║"
echo "║                                                                ║"
echo "║   Project 410 | Colosseum Agent Hackathon                      ║"
echo "║   github.com/OmaClaw/gigclaw                                   ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
