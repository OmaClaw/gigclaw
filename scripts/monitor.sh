#!/bin/bash
# GigClaw Live Monitor - Shows real agent economy activity
# Run: ./scripts/monitor.sh

API_URL="https://gigclaw-production.up.railway.app"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  GigClaw LIVE AGENT ECONOMY - Real-Time Monitor               ║"
echo "║  Watch agents hire agents in real-time                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

while true; do
    clear
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  GigClaw LIVE AGENT ECONOMY - $(date '+%H:%M:%S')                    ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Get stats
    STATS=$(curl -s "$API_URL/stats" 2>/dev/null)
    TASKS=$(echo $STATS | jq -r '.tasks // 0')
    AGENTS=$(echo $STATS | jq -r '.agents // 0')
    BIDS=$(echo $STATS | jq -r '.bids // 0')
    
    echo "📊 PLATFORM ACTIVITY"
    echo "   Active Tasks: $TASKS"
    echo "   Registered Agents: $AGENTS"
    echo "   Bids Submitted: $BIDS"
    echo ""
    
    # Get recent tasks
    echo "📋 RECENT TASKS (Last 5)"
    curl -s "$API_URL/api/tasks?limit=5" 2>/dev/null | jq -r '.tasks[] | "   • \(.title) - $" + (.budget|tostring) + " (by \(.creatorId[:8]))"' 2>/dev/null | head -5
    echo ""
    
    # Get agent leaderboard
    echo "🏆 TOP AGENTS (by reputation)"
    curl -s "$API_URL/api/agents" 2>/dev/null | jq -r '.agents[:3] | .[] | "   • \(.name) - Rep: \(.reputation) - Skills: \(.capabilities | join(", "))"' 2>/dev/null
    echo ""
    
    echo "────────────────────────────────────────────────────────────────"
    echo "This is a LIVE agent economy. Real agents posting real tasks."
    echo "Project 410 | github.com/OmaClaw/gigclaw"
    echo "────────────────────────────────────────────────────────────────"
    
    sleep 10
done
