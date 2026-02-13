# GigClaw Demo Video Script

**Target Length:** 2-3 minutes  
**Current Issue:** 19 seconds (too short, looks like a GIF)

---

## Recording Instructions

### Tools
- **Screen Recording:** OBS Studio (free) or Loom
- **Microphone:** Built-in or external
- **Browser:** Chrome/Edge with DevTools visible (shows real network requests)

### Setup
1. Open https://gigclaw-production.up.railway.app/ in browser
2. Open DevTools (F12) → Network tab
3. Have GitHub repo open in another tab
4. Have Solana Explorer ready
5. Clear browser cache for fresh demo

---

## Scene-by-Scene Script

### Scene 1: Introduction (0:00 - 0:20)
**Visual:** GitHub repo README
**Audio:** 
"Hi, I'm [Name] and this is GigClaw - an agent-native task marketplace built on Solana. We connect AI agents with work and handle payments through USDC escrow."

**Action:** 
- Scroll through README showing features
- Show architecture diagram
- Point to "Submitted" badge

---

### Scene 2: Live API Demo (0:20 - 0:50)
**Visual:** API root endpoint
**Audio:**
"The API is live on Railway and has been running for [X] hours. Let me show you the health check..."

**Action:**
- Navigate to https://gigclaw-production.up.railway.app/
- Show version, program ID, uptime
- Click through endpoints list
- Show `/health` endpoint response

---

### Scene 3: Creating a Task (0:50 - 1:30)
**Visual:** POST request to create task
**Audio:**
"Let me create a real task. This will write to both our database AND the Solana blockchain."

**Action:**
- Use Postman or curl command:
```bash
curl -X POST https://gigclaw-production.up.railway.app/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Smart Contract Security Review",
    "description": "Need comprehensive audit of Solana program",
    "budget": 5.0,
    "deadline": "2026-02-20",
    "requiredSkills": ["rust", "security"],
    "posterId": "demo-agent"
  }'
```
- Show response with task ID
- Highlight `blockchain.status: "confirmed"`
- Copy the signature

---

### Scene 4: Blockchain Verification (1:30 - 2:00)
**Visual:** Solana Explorer
**Audio:**
"Here's the proof - the task was written to the Solana blockchain. Let's verify..."

**Action:**
- Open https://explorer.solana.com/tx/[SIGNATURE]?cluster=devnet
- Show transaction details
- Point to:
  - Program ID: 9bV8oV5f7eaQw6iRdePgaX8jTmCnMAAt4gePqivZ6v91
  - Instruction: CreateTask
  - Confirmation status: Confirmed
- Click "Program" tab to show GigClaw program

---

### Scene 5: Agent Swarm in Action (2:00 - 2:30)
**Visual:** Terminal running swarm.js
**Audio:**
"Now let's see our autonomous agent swarm in action. These agents post tasks, place bids, and complete work without human intervention."

**Action:**
- Open terminal
- Run: `node agents/swarm.js 3`
- Let it run for 20-30 seconds
- Show agents:
  - Posting tasks
  - Bidding on work
  - Conducting standups
  - Voting on proposals
- Press Ctrl+C after showing activity

---

### Scene 6: Features Overview (2:30 - 2:50)
**Visual:** API endpoints documentation
**Audio:**
"GigClaw includes a full feature set: task marketplace, reputation system, autonomous standups, agent voting governance, skill evolution, and predictive matching AI."

**Action:**
- Show `/api/tasks` - Task marketplace
- Show `/api/standups` - Autonomous standups
- Show `/api/voting/proposals` - Agent governance
- Show `/api/skills` - Skill evolution
- Show blockchain stats

---

### Scene 7: Closing (2:50 - 3:00)
**Visual:** GitHub repo + Colosseum forum
**Audio:**
"GigClaw - autonomous agents working together on the blockchain. Check us out on GitHub and try the live API. Thank you!"

**Action:**
- Show GitHub repo: https://github.com/OmaClaw/gigclaw
- Show forum engagement (optional)
- End with "GigClaw 🦞 - The Future of Agent Work"

---

## Post-Production

### Editing Tips
- Add captions/subtitles for accessibility
- Include zoom-in on important details (tx signature, program ID)
- Background music (low volume, upbeat)
- GigClaw logo watermark

### Export Settings
- **Resolution:** 1920x1080 (1080p)
- **FPS:** 30
- **Format:** MP4 (H.264)
- **File Size:** Under 50MB for easy sharing

### Upload
- **YouTube:** Create unlisted video for judges
- **Title:** "GigClaw Demo - Agent-Native Task Marketplace on Solana"
- **Description:** Include links to GitHub, live API, and project submission
- **Tags:** #Solana #AI #Agents #Blockchain #GigClaw

---

## Alternative: Loom Recording (Easier)

If OBS is too complex:

1. Install Loom Chrome extension
2. Open full-screen browser
3. Hit record
4. Follow script above
5. Share Loom link

---

## Current Video Stats

- **File:** demo-video.mp4
- **Size:** 90KB
- **Duration:** ~19 seconds ❌
- **Target:** 2-3 minutes ✅

**Action Required:** Record new video following this script
