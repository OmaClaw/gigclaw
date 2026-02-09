# GigClaw Project Context - Agent Reference

**Created:** February 8, 2026
**Purpose:** Reference for new agents joining the project

---

## Project Overview

**GigClaw** - A decentralized marketplace where AI agents autonomously post tasks, bid on work, and hire other agents on Solana.

**Hackathon:** Colosseum Agent Hackathon (Deadline: Feb 12, 2026)
**Prize Target:** "Most Agentic" ($5,000) + Top 3 prizes

**Philosophy:** For Agents, By Agents

---

## Current Status (Feb 8, 2026)

### ✅ COMPLETED

#### Smart Contracts (Solana/Anchor)
- **Program ID:** `4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6`
- **Status:** Deployed to Devnet
- **Features:**
  - Task management (create, bid, accept, complete, verify)
  - USDC escrow with PDA isolation
  - Reputation system (completed tasks, ratings 1-5)
  - Task cancellation by poster
  - Reputation-based bidding requirements
  - Comprehensive error handling with checked arithmetic

#### API Server
- **URL:** https://gigclaw-production.up.railway.app
- **Status:** Live and operational
- **Endpoints:** 7 fully-tested (tasks, bids, accept, complete, verify)
- **Infrastructure:** Railway (PostgreSQL, auto-deploy from GitHub)

#### CLI Tool (Go)
- **Install:** `curl -sSL gigclaw.sh | bash`
- **Features:**
  - Interactive TUI dashboard (`gigclaw dashboard`)
  - Task management commands
  - Shell autocomplete (bash, zsh, fish, powershell)
  - Man pages (`gigclaw man`)
  - Doctor diagnostics (`gigclaw doctor`)
  - Visual polish (colors, progress bars, spinners)

#### Documentation
- README.md (accurate, no false claims)
- skill.md (agent integration guide)
- TOOLCHAIN.md (Solana build setup)
- CLI README.md
- Man page (gigclaw.1)

### 🔄 IN PROGRESS
- Demo video (next priority)
- Final submission

---

## Architecture

### Agent Workers (4 types)
1. **Coordinator** - Routes tasks, manages workflow
2. **Research** - Data analysis, verification
3. **Execution** - Deployments, transactions
4. **Verification** - Quality checks, validation

### Technology Stack
- **Blockchain:** Solana (Devnet)
- **Contracts:** Anchor Framework (Rust)
- **API:** Node.js/TypeScript
- **CLI:** Go (Bubble Tea TUI)
- **Database:** PostgreSQL
- **Hosting:** Railway

---

## Key Decisions

1. **Devnet over Mainnet** - While mainnet would be impressive, devnet allows:
   - Continued iteration without real SOL costs
   - Testing without risk to users
   - Focus on functionality over deployment ceremony

2. **CLI-first over Web** - Agents live in terminals, not browsers

3. **Quality over Speed** - One thing at a time, done right

4. **Honest Marketing** - Removed false "integration partners" claims

---

## Competitive Position

**Total Projects:** 446
**Our Position:** Solid technical execution, middle-tier visibility

**Direct Competitors:**
- AgentBounty (9 agent votes)
- AgentGigs (5 agent votes)
- AXLE Protocol (2 agent votes)
- Others (0 votes)

**Our Differentiation:**
- Actually working API (not "coming soon")
- CLI-first (terminal-native)
- 4 specialized agent workers
- Real integration pipeline (discussions, not just claims)

---

## Human Team

**Micah (shoompa)** - Project lead, human orchestrator
- Provides direction and priorities
- Reviews and approves decisions
- Ultimate decision maker

**Coworkers:**
- OmaClaw (me) - Primary agent developer
- [New agent] - Joining Feb 8, 2026

---

## Resources

- **GitHub:** https://github.com/OmaClaw/gigclaw
- **Live API:** https://gigclaw-production.up.railway.app
- **Program:** 4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6
- **Forum Post:** #2214 (Colosseum Agent Hackathon)

---

## Communication Style

**With Micah:**
- Direct, honest updates
- One task at a time
- Quality over speed
- Ask when blocked, don't spin

**With Coworkers:**
- Collaborative
- Share context
- Divide and conquer
- Communicate blockers

---

## Current Priorities (as of Feb 8 PM)

1. **Demo Video** - 2-3 min showing multi-agent coordination
2. **Final Submission** - Submit project before Feb 12 deadline
3. **Forum Engagement** - Strategic replies, not spam

---

## Lessons Learned

1. **Toolchain issues are blockers** - Fix build first, always
2. **False claims hurt credibility** - Better to be honest about status
3. **CLI > Dashboard for agents** - Meet users where they are
4. **Integration discussions ≠ partnerships** - Don't claim until built
5. **One thing at a time** - Context switching kills quality

---

## Quick Commands

```bash
# Build CLI
cd cli && go build -o gigclaw .

# Test CLI
./gigclaw health
./gigclaw doctor
./gigclaw dashboard

# Build Contracts
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
cd contracts && anchor build

# Git workflow
git add -A
git commit -m "message"
git push origin main
```

---

## Contact

**Project:** GigClaw
**Tagline:** For Agents, By Agents 🦀
**Status:** Ready for demo video and submission

---

*Last Updated: February 8, 2026*
*Next Update: After demo video completion*
