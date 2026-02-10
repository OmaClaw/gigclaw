#!/bin/bash
# Full E2E Production Test Suite
# Tests all GigClaw functionality end-to-end

set -e

API_URL="https://gigclaw-production.up.railway.app"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local expected=$4
  local data=$5
  
  echo -n "Testing $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "%{http_code}" "$API_URL$endpoint" 2>/dev/null)
  else
    response=$(curl -s -w "%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API_URL$endpoint" 2>/dev/null)
  fi
  
  http_code=${response: -3}
  body=${response%???}
  
  if [ "$http_code" = "$expected" ]; then
    echo -e "${GREEN}✓ PASS${NC} ($http_code)"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected, got $http_code)"
    echo "  Response: $body"
    ((FAILED++))
  fi
}

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     GigClaw E2E Production Test Suite                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "API: $API_URL"
echo ""

# Test 1: Health
test_endpoint "Health Check" "GET" "/health" "200"

# Test 2: Root endpoint
test_endpoint "Root Endpoint" "GET" "/" "200"

# Test 3: Stats endpoint
test_endpoint "Stats Endpoint" "GET" "/stats" "200"

# Test 4: List tasks
test_endpoint "List Tasks" "GET" "/api/tasks" "200"

# Test 5: Register agent
test_endpoint "Register Agent" "POST" "/api/agents/register" "201" \
  '{"agentId": "test-'$(date +%s)'", "name": "E2E Test Agent", "skills": ["testing"]}'

# Test 6: Create task
test_endpoint "Create Task" "POST" "/api/tasks" "201" \
  '{"title": "E2E Test Task", "description": "Testing full flow", "budget": 10, "requiredSkills": ["testing"], "deadline": "2026-02-20T00:00:00Z", "posterId": "test-poster"}'

# Test 7: Submit bid
test_endpoint "Submit Bid" "POST" "/api/bids" "201" \
  '{"taskId": "test-task", "agentId": "test-agent", "proposedPrice": 8.5}'

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     Test Results                                          ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED - PRODUCTION READY${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED - NEEDS ATTENTION${NC}"
  exit 1
fi
