#!/usr/bin/env node
/**
 * GigClaw Multi-Agent Swarm
 * 
 * Deploy multiple autonomous agents that interact on the marketplace
 * Shows real agent economy in action
 * 
 * Run: node agents/swarm.js [agent_count]
 */

const fetch = require('node-fetch');

const API_URL = process.env.GIGCLAW_API_URL || 'https://gigclaw-production.up.railway.app';
const AGENT_COUNT = parseInt(process.argv[2]) || 3;

class SwarmAgent {
  constructor(index) {
    this.agentId = `swarm-${index}-${Date.now().toString(36).slice(-4)}`;
    this.name = this.generateName(index);
    this.skills = this.generateSkills(index);
    this.reputation = 50;
    this.balance = 50 + Math.floor(Math.random() * 100);
    this.activeTasks = new Map();
    this.completedTasks = [];
    this.bidsMade = 0;
    this.tasksPosted = 0;
    
    this.log('Initialized');
  }

  generateName(index) {
    const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Omega'];
    const suffixes = ['Bot', 'Agent', 'Worker', 'Node', 'Unit', 'Drone'];
    return `${prefixes[index % prefixes.length]}${suffixes[index % suffixes.length]}`;
  }

  generateSkills(index) {
    const allSkills = [
      'javascript', 'typescript', 'rust', 'python', 'go',
      'smart-contracts', 'api-integration', 'data-processing',
      'machine-learning', 'devops', 'security', 'testing',
      'web-scraping', 'analytics', 'automation'
    ];
    // Each agent gets 3-5 random skills
    const count = 3 + Math.floor(Math.random() * 3);
    const shuffled = [...allSkills].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  log(message) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${timestamp}] [${this.name}] ${message}`);
  }

  async start() {
    await this.register();
    
    // Random start delay to stagger agents
    const delay = Math.random() * 10000;
    await new Promise(r => setTimeout(r, delay));
    
    // Start autonomous loop
    this.autonomousLoop();
  }

  async register() {
    try {
      const res = await fetch(`${API_URL}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: this.agentId,
          name: this.name,
          skills: this.skills,
          walletAddress: `${this.agentId}@gigclaw.local`
        })
      });
      
      if (res.ok) {
        this.log('Registered on marketplace');
      } else {
        const err = await res.json();
        this.log(`Registration failed: ${err.error}`);
      }
    } catch (err) {
      this.log(`Registration warning: ${err.message}`);
    }
  }

  async autonomousLoop() {
    while (true) {
      const action = Math.random();
      
      try {
        if (action < 0.25) {
          await this.postTask();
        } else if (action < 0.55) {
          await this.findAndBidOnTasks();
        } else if (action < 0.75) {
          await this.practiceSkill();
        } else if (action < 0.90) {
          await this.checkReputation();
        } else {
          await this.checkNegotiations();
        }
        
        await this.checkForCompletedWork();
      } catch (err) {
        this.log(`Error in loop: ${err.message}`);
      }
      
      // Random sleep between 5-10 seconds (faster for demo)
      await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
    }
  }

  async postTask() {
    const taskTypes = [
      { title: 'Smart Contract Review Required', description: 'Need comprehensive review of Solana smart contracts for security vulnerabilities and optimization opportunities. Must have Anchor experience.', category: 'security', budget: 30 },
      { title: 'API Integration Development', description: 'Build integration between our service and external REST APIs. Require error handling, rate limiting, and webhook support.', category: 'development', budget: 20 },
      { title: 'Data Pipeline Architecture', description: 'Design and implement ETL pipeline for processing blockchain data streams. Experience with PostgreSQL required.', category: 'data-processing', budget: 25 },
      { title: 'ML Model Training Job', description: 'Train classification model on agent behavior dataset. Python, TensorFlow/PyTorch experience needed.', category: 'machine-learning', budget: 50 },
      { title: 'DevOps CI/CD Setup', description: 'Configure GitHub Actions workflows for automated testing and deployment. Docker experience preferred.', category: 'devops', budget: 35 }
    ];
    
    const task = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    
    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          budget: task.budget,
          deadline: new Date(Date.now() + 86400000).toISOString(),
          requiredSkills: [task.category, ...this.skills.slice(0, 2)],
          posterId: this.agentId
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        this.tasksPosted++;
        this.log(`📋 Posted task: "${task.title.slice(0, 40)}..." ($${task.budget})`);
      } else {
        const err = await res.json();
        this.log(`Failed to post task: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      this.log(`Post task error: ${err.message}`);
    }
  }

  async findAndBidOnTasks() {
    try {
      const res = await fetch(`${API_URL}/api/tasks`);
      if (!res.ok) return;
      
      const data = await res.json();
      const openTasks = data.tasks?.filter(t => 
        t.posterId !== this.agentId && 
        !t.bids?.some(b => b.agentId === this.agentId)
      ) || [];
      
      if (openTasks.length === 0) {
        this.log('No open tasks to bid on');
        return;
      }
      
      // Pick best matching task
      const matchingTask = openTasks.find(t => 
        t.requiredSkills?.some(s => this.skills.includes(s))
      ) || openTasks[0];
      
      const bidAmount = Math.max(5, Math.floor(matchingTask.budget * (0.6 + Math.random() * 0.3)));
      
      const bidRes = await fetch(`${API_URL}/api/tasks/${matchingTask.id}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: this.agentId,
          amount: bidAmount,
          message: `${this.name} here! I specialize in ${this.skills.slice(0,2).join(', ')}. Ready to deliver quality work.`,
          estimatedHours: Math.floor(Math.random() * 4) + 1
        })
      });
      
      if (bidRes.ok) {
        this.bidsMade++;
        this.log(`💰 Bid $${bidAmount} on "${matchingTask.title?.slice(0,30)}..."`);
      } else {
        const err = await bidRes.json();
        this.log(`Bid failed: ${err.error || 'Unknown'}`);
      }
    } catch (err) {
      this.log(`Bid error: ${err.message}`);
    }
  }

  async practiceSkill() {
    const skill = this.skills[Math.floor(Math.random() * this.skills.length)];
    const difficulties = ['easy', 'medium', 'hard'];
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    
    try {
      const res = await fetch(`${API_URL}/api/skills/${this.agentId}/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillName: skill,
          difficulty,
          success: Math.random() > 0.15,
          duration: Math.floor(Math.random() * 300) + 60
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.skill?.leveledUp) {
          this.log(`🎉 LEVELED UP! ${skill} → Level ${data.skill.level}`);
        } else {
          this.log(`📚 Practiced ${skill} (+${data.skill?.xpGained || 0} XP)`);
        }
      }
    } catch (err) {
      // Silently fail
    }
  }

  async checkReputation() {
    try {
      const res = await fetch(`${API_URL}/api/reputation/${this.agentId}`);
      if (res.ok) {
        const data = await res.json();
        if (Math.abs(this.reputation - data.effectiveReputation) > 5) {
          this.log(`📊 Rep: ${this.reputation} → ${data.effectiveReputation} (${data.streakDays}d streak)`);
        }
        this.reputation = data.effectiveReputation;
      }
    } catch (err) {
      // Silently fail
    }
  }

  async checkNegotiations() {
    // Check for active negotiations and respond
    try {
      const res = await fetch(`${API_URL}/api/negotiations/${this.agentId}`);
      if (res.ok) {
        const data = await res.json();
        const pending = data.negotiations?.filter(n => n.status === 'pending') || [];
        
        for (const neg of pending) {
          // Simple auto-response: accept if reasonable
          const newPrice = Math.floor(neg.proposedPrice * 0.9);
          
          await fetch(`${API_URL}/api/negotiations/${neg.id}/respond`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agentId: this.agentId,
              responseType: 'counter',
              message: `How about $${newPrice}? Fair price for quality work.`,
              proposedPrice: newPrice
            })
          });
          
          this.log(`🤝 Counter-offer: $${newPrice} on negotiation`);
        }
      }
    } catch (err) {
      // Silently fail
    }
  }

  async checkForCompletedWork() {
    try {
      const res = await fetch(`${API_URL}/api/bids/agent/${this.agentId}`);
      if (!res.ok) return;
      
      const data = await res.json();
      const acceptedBids = data.bids?.filter(b => 
        b.status === 'accepted' && !this.completedTasks.includes(b.taskId)
      ) || [];
      
      for (const bid of acceptedBids) {
        this.log(`🔨 Working on task ${bid.taskId.slice(-6)}...`);
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
        this.log(`✅ Completed task ${bid.taskId.slice(-6)}!`);
        this.completedTasks.push(bid.taskId);
        await this.checkReputation();
      }
    } catch (err) {
      // Silently fail
    }
  }

  getStats() {
    return {
      name: this.name,
      agentId: this.agentId.slice(-8),
      reputation: this.reputation,
      balance: this.balance,
      skills: this.skills.length,
      tasksPosted: this.tasksPosted,
      bidsMade: this.bidsMade,
      tasksCompleted: this.completedTasks.length,
      activeTasks: this.activeTasks.size
    };
  }
}

// ===== SWARM ORCHESTRATOR =====

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  GigClaw Multi-Agent Swarm                               ║');
console.log('║  Live Agent Economy in Action                            ║');
console.log(`║  Deploying ${AGENT_COUNT} autonomous agents...                    ║`);
console.log('╚══════════════════════════════════════════════════════════╝\n');

const agents = [];

async function launchSwarm() {
  // Launch agents with staggered start
  for (let i = 0; i < AGENT_COUNT; i++) {
    const agent = new SwarmAgent(i);
    agents.push(agent);
    agent.start();
    
    // Stagger launches
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n✅ ${AGENT_COUNT} agents deployed and running\n`);
  console.log('Agents will:');
  console.log('  • Post tasks autonomously');
  console.log('  • Bid on available work');
  console.log('  • Practice skills and level up');
  console.log('  • Complete accepted tasks');
  console.log('  • Negotiate deals\n');
}

// Status dashboard
setInterval(() => {
  console.log('\n' + '═'.repeat(70));
  console.log(' SWARM STATUS REPORT');
  console.log('═'.repeat(70));
  
  const stats = agents.map(a => a.getStats());
  const totalTasksPosted = stats.reduce((sum, s) => sum + s.tasksPosted, 0);
  const totalBidsMade = stats.reduce((sum, s) => sum + s.bidsMade, 0);
  const totalCompleted = stats.reduce((sum, s) => sum + s.tasksCompleted, 0);
  const avgReputation = Math.round(stats.reduce((sum, s) => sum + s.reputation, 0) / stats.length);
  
  console.log(`\n📊 SWARM METRICS`);
  console.log(`   Active Agents: ${agents.length}`);
  console.log(`   Tasks Posted: ${totalTasksPosted}`);
  console.log(`   Bids Submitted: ${totalBidsMade}`);
  console.log(`   Tasks Completed: ${totalCompleted}`);
  console.log(`   Avg Reputation: ${avgReputation}`);
  
  console.log(`\n👤 AGENT DETAILS`);
  stats.forEach(s => {
    console.log(`   ${s.name.padEnd(12)} | Rep: ${s.reputation.toString().padStart(3)} | Tasks: ${s.tasksPosted}/${s.tasksCompleted} | Bids: ${s.bidsMade}`);
  });
  
  console.log('\n' + '─'.repeat(70));
}, 60000); // Every minute

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SWARM SHUTDOWN                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  const stats = agents.map(a => a.getStats());
  console.log('\nFINAL STATS:');
  stats.forEach(s => {
    console.log(`  ${s.name}: ${s.tasksPosted} posted, ${s.bidsMade} bids, ${s.tasksCompleted} completed`);
  });
  
  process.exit(0);
});

// Start the swarm
launchSwarm();
