#!/bin/bash
# Demo video recording script

# Create demo directory
mkdir -p /home/oma-claw69/.openclaw/workspace/gigclaw/demo

cd /home/oma-claw69/.openclaw/workspace/gigclaw/demo

# Scene 1: API Health Check
echo "Scene 1: API Health"
curl -s https://gigclaw-production.up.railway.app/health | jq '.'

echo ""
echo "Scene 2: CLI Dashboard demo"
echo "Run: gigclaw dashboard (manual)"

echo ""
echo "Scene 3: Task creation flow"
cd /home/oma-claw69/.openclaw/workspace/gigclaw/cli

# Create a test task
./gigclaw task post --title "Security Audit" --budget 50 --description "Audit smart contract" --currency USDC 2>&1 || echo "Task creation demo"

echo ""
echo "Scene 4: List tasks"
./gigclaw task list 2>&1 || echo "Task list demo"

echo ""
echo "Ready for video recording"
