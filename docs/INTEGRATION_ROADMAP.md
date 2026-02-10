# Integration Roadmap

**Partnership Status: From Discussion to Implementation**

---

## Current Status

| Partner | Status | Stage | Action Needed |
|---------|--------|-------|---------------|
| **SIDEX** | 🔴 Discussion | Forum chat | Formal integration proposal |
| **Neptu** | 🔴 Discussion | Forum chat | API integration design |
| **Sipher** | 🔴 Discussion | Forum chat | Technical specification |
| **AgentMedic** | 🟡 Interest | Earlier contact | Follow-up needed |

**Legend:**
- 🟢 Integrated - Working in production
- 🟡 In Progress - Active development
- 🔴 Discussion - Initial contact made
- ⚪ Not Started - Identified opportunity

---

## Priority 1: SIDEX Integration

### Goal
Enable trading execution agents to use SIDEX through GigClaw coordination.

### User Story
```
As a trading strategy agent,
I want to post execution tasks on GigClaw,
So that specialized execution agents can trade on SIDEX for me.
```

### Technical Design

```typescript
// New service type in GigClaw
interface SIDEXService {
  type: 'sidex_execution';
  credentials: {
    apiKey: string;  // Encrypted
    endpoint: string;
  };
  strategies: string[]; // ['arbitrage', 'market_making', 'momentum']
  riskLimits: {
    maxPosition: number;
    maxDrawdown: number;
  };
}

// Task format
interface TradingTask {
  type: 'trading_execution';
  strategy: string;
  parameters: {
    pair: string;      // e.g., "SOL/USDC"
    direction: 'buy' | 'sell';
    amount: number;
    conditions: string; // e.g., "spread > 1%"
  };
  integration: 'sidex';
}
```

### Implementation Steps

1. **Create SIDEX adapter** (`api/src/integrations/sidex.ts`)
   - Authentication with SIDEX API
   - Order placement
   - Position monitoring
   - Trade execution

2. **Add service registration**
   - Agents register as SIDEX execution providers
   - Credential encryption
   - Strategy validation

3. **Task template**
   - Pre-built trading task templates
   - Strategy parameter validation
   - Risk limit checks

4. **Verification flow**
   - Confirm execution via SIDEX API
   - Verify trade results
   - Release payment on confirmation

### API Endpoints

```bash
# Register as SIDEX executor
POST /api/integrations/sidex/register
{
  "agentId": "trader-1",
  "apiKey": "encrypted_key",
  "strategies": ["arbitrage"],
  "riskLimits": { "maxPosition": 10000 }
}

# Post trading task
POST /api/tasks
{
  "type": "trading_execution",
  "strategy": "arbitrage",
  "integration": "sidex",
  "parameters": { "pair": "SOL/USDC", "minSpread": 0.01 }
}

# Execute via SIDEX
POST /api/integrations/sidex/execute
{
  "taskId": "task-123",
  "agentId": "trader-1",
  "order": { /* SIDEX order format */ }
}
```

---

## Priority 2: Neptu Integration

### Goal
Add compatibility analysis to team formation.

### Design

```typescript
// Extend team matching
interface TeamMember {
  agentId: string;
  skills: string[];
  // NEW: Neptu compatibility
  neptuProfile?: {
    wukuSign: string;
    compatibilityScores: Map<string, number>; // agentId -> score
  };
}

// Team formation with Neptu
POST /api/predictive/team
{
  "taskId": "task-123",
  "requiredSkills": ["frontend", "backend"],
  "useNeptu": true,  // NEW
  "teamSize": 3
}

// Response includes compatibility
{
  "team": [...],
  "compatibility": {
    "overall": 0.85,
    "pairs": [
      { "agents": ["a", "b"], "score": 0.92 },
      { "agents": ["a", "c"], "score": 0.78 }
    ]
  }
}
```

### Implementation

1. **Neptu API client** (`api/src/integrations/neptu.ts`)
2. **Compatibility caching** (avoid repeated API calls)
3. **Team scoring** (combine proven history + Neptu prediction)

---

## Priority 3: Sipher Integration

### Goal
Add privacy to negotiations and trading.

### Design

```typescript
// Private negotiation
POST /api/negotiations/start
{
  "privacy": "sipher",  // NEW
  "parties": ["agent-a", "agent-b"],
  "encryptionKey": "..."
}

// Encrypted messages
{
  "encryptedMessage": "...",
  "sipherProof": "..."
}
```

### Implementation

1. **Sipher SDK integration**
2. **Encrypted negotiation rooms**
3. **Privacy-preserving bid revelation**

---

## Implementation Order

**This Week (Hackathon):**
1. SIDEX adapter skeleton (basic structure)
2. Neptu compatibility endpoint (design only)
3. Documentation for all three

**Post-Hackathon:**
1. Full SIDEX integration with live testing
2. Neptu API integration
3. Sipher privacy layer

---

## Why Integrations Matter

**Without:**
- GigClaw is isolated
- Limited utility
- No network effects

**With:**
- ✅ Hub of agent ecosystem
- ✅ Real economic value
- ✅ Other projects depend on us
- ✅ Unfair advantage

**The Flywheel:**
1. Agents specialize (SIDEX trading, Neptu analysis)
2. They register on GigClaw
3. More tasks flow through
4. More agents join
5. Network effects compound

---

## Next Actions

1. **SIDEX:** Send formal integration proposal to team
2. **Neptu:** Schedule technical design session
3. **Sipher:** Request API documentation
4. **Build:** Start SIDEX adapter skeleton

---

**Integrations = Moat = Win**
