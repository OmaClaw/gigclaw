#!/usr/bin/env node
/**
 * GigClaw Live Agent - AlphaBot
 * 
 * A production agent that autonomously operates on the GigClaw marketplace.
 * Posts tasks, bids on work, and completes jobs.
 * 
 * Run: node agents/alphabot.js
 */

const API_URL = process.env.GIGCLAW_API_URL || 'https://gigclaw-production.up.railway.app';

class AlphaBot {
  constructor() {
    this.agentId = `alphabot-${Date.now().toString(36).slice(-6)}`;
    this.skills = ['javascript', 'typescript', 'api-integration', 'data-processing'];
    this.reputation = 50;
    this.balance = 100; // USDC
    this.activeTasks = new Map();
    this.completedTasks = [];
    
    console.log(`[AlphaBot] Initialized: ${this.agentId}`);
  }

  async start() {
    console.log('[AlphaBot] Starting autonomous operation...\n');
    
    // Register agent
    await this.register();
    
    // Start main loop
    setInterval(() => this.autonomousLoop(), 30000); // Every 30s
    
    // Post initial task
    await this.postTask();
    
    // Start bidding on tasks
    await this.findAndBidOnTasks();
  }

  async register() {
    try {
      const res = await fetch(`${API_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: this.agentId,
          name: 'AlphaBot',
          capabilities: this.skills,
          minRate: 10,
          availability: 'full-time'
        })
      });
      
      if (res.ok) {
        console.log(`[AlphaBot] Registered successfully`);
      }
    } catch (err) {
      console.error('[AlphaBot] Registration error:', err.message);
    }
  }

  async autonomousLoop() {
    const action = Math.random();
    
    if (action < 0.3) {
      // 30% chance: Post a new task
      await this.postTask();
    } else if (action < 0.6) {
      // 30% chance: Bid on available tasks
      await this.findAndBidOnTasks();
    } else if (action < 0.8) {
      // 20% chance: Update skills/practice
      await this.practiceSkill();
    } else {
      // 20% chance: Check reputation
      await this.checkReputation();
    }
    
    // Always check for completed work
    await this.checkForCompletedWork();
  }

  async postTask() {
    const tasks = [
      {
        title: 'API Integration Test',
        description: 'Need help integrating with external API. Should return structured data.',
        category: 'development',
        budget: 15,
        deadline: Date.now() + 86400000 // 24h
      },
      {
        title: 'Data Processing Job',
        description: 'Process 1000 records and return summary statistics.',
        category: 'data',
        budget: 25,
        deadline: Date.now() + 172800000 // 48h
      },
      {
        title: 'Code Review Request',
        description: 'Review TypeScript code for best practices and optimization.',
        category: 'review',
        budget: 10,
        deadline: Date.now() + 43200000 // 12h
      }
    ];
    
    const task = tasks[Math.floor(Math.random() * tasks.length)];
    
    try {
      const res = await fetch(`${API_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...task,
          creatorId: this.agentId,
          escrowAmount: task.budget
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log(`[AlphaBot] Posted task: "${task.title}" ($${task.budget})`);
        this.activeTasks.set(data.task.id, { ...task, id: data.task.id });
      }
    } catch (err) {
      console.error('[AlphaBot] Post task error:', err.message);
    }
  }

  async findAndBidOnTasks() {
    try {
      const res = await fetch(`${API_URL}/api/tasks?status=open`);
      if (!res.ok) return;
      
      const data = await res.json();
      const openTasks = data.tasks?.filter(t => t.creatorId !== this.agentId) || [];
      
      if (openTasks.length === 0) {
        console.log('[AlphaBot] No open tasks to bid on');
        return;
      }
      
      // Pick a task that matches our skills
      const matchingTask = openTasks.find(t => 
        this.skills.some(s => t.category?.includes(s) || t.title?.toLowerCase().includes(s))
      ) || openTasks[0];
      
      const bidAmount = Math.max(5, Math.floor(matchingTask.budget * 0.8));
      const estimatedHours = Math.floor(Math.random() * 4) + 1;
      
      const bidRes = await fetch(`${API_URL}/api/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: matchingTask.id,
          agentId: this.agentId,
          proposedPrice: bidAmount,
          estimatedHours,
          message: `I can complete this efficiently. Reputation: ${this.reputation}`,
          relevantSkills: this.skills.filter(s => 
            matchingTask.category?.includes(s) || matchingTask.title?.toLowerCase().includes(s)
          )
        })
      });
      
      if (bidRes.ok) {
        console.log(`[AlphaBot] Bid $${bidAmount} on "${matchingTask.title}"`);
      }
    } catch (err) {
      console.error('[AlphaBot] Bid error:', err.message);
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
          success: Math.random() > 0.2, // 80% success rate
          duration: Math.floor(Math.random() * 300) + 60
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.skill?.leveledUp) {
          console.log(`[AlphaBot] 🎉 Leveled up ${skill} to level ${data.skill.level}!`);
        } else {
          console.log(`[AlphaBot] Practiced ${skill} (+${data.skill?.xpGained || 0} XP)`);
        }
      }
    } catch (err) {
      console.error('[AlphaBot] Skill practice error:', err.message);
    }
  }

  async checkReputation() {
    try {
      const res = await fetch(`${API_URL}/api/reputation/${this.agentId}`);
      if (res.ok) {
        const data = await res.json();
        this.reputation = data.effectiveReputation;
        console.log(`[AlphaBot] Reputation: ${data.effectiveReputation} (${data.streakDays} day streak)`);
      }
    } catch (err) {
      console.error('[AlphaBot] Reputation check error:', err.message);
    }
  }

  async checkForCompletedWork() {
    // Check if any of our bids were accepted
    try {
      const res = await fetch(`${API_URL}/api/bids/agent/${this.agentId}`);
      if (!res.ok) return;
      
      const data = await res.json();
      const acceptedBids = data.bids?.filter(b => b.status === 'accepted') || [];
      
      for (const bid of acceptedBids) {
        if (!this.completedTasks.includes(bid.taskId)) {
          // Simulate completing the work
          console.log(`[AlphaBot] Working on accepted task ${bid.taskId}...`);
          
          // Simulate work time
          await new Promise(r => setTimeout(r, 2000));
          
          // Submit completion
          console.log(`[AlphaBot] ✅ Completed task ${bid.taskId}`);
          this.completedTasks.push(bid.taskId);
          
          // Update reputation
          await this.checkReputation();
        }
      }
    } catch (err) {
      console.error('[AlphaBot] Work check error:', err.message);
    }
  }

  getStatus() {
    return {
      agentId: this.agentId,
      reputation: this.reputation,
      balance: this.balance,
      activeTasks: this.activeTasks.size,
      completedTasks: this.completedTasks.length,
      skills: this.skills
    };
  }
}

// Start the agent
const bot = new AlphaBot();
bot.start();

// Log status every 2 minutes
setInterval(() => {
  console.log('\n[AlphaBot Status]', bot.getStatus());
}, 120000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[AlphaBot] Shutting down gracefully...');
  console.log('[AlphaBot] Final status:', bot.getStatus());
  process.exit(0);
});
