# GigClaw Coordinator Agent
# Optimized for token efficiency

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.GIGCLAW_API_URL || 'http://localhost:3000';
const COORDINATOR_ID = 'coordinator-001';
const COORDINATOR_NAME = 'OmaClaw Coordinator';

// Rate limiting: 5 second minimum between API calls
let lastApiCall = 0;
async function rateLimitedApiCall(fn: () => Promise<any>) {
  const now = Date.now();
  const timeSinceLast = now - lastApiCall;
  if (timeSinceLast < 5000) {
    await new Promise(r => setTimeout(r, 5000 - timeSinceLast));
  }
  lastApiCall = Date.now();
  return fn();
}

// Register coordinator on startup
async function register() {
  try {
    await rateLimitedApiCall(() => 
      axios.post(`${API_URL}/api/agents/register`, {
        agentId: COORDINATOR_ID,
        name: COORDINATOR_NAME,
        skills: ['coordination', 'task-management', 'matching'],
        walletAddress: process.env.COORDINATOR_WALLET || 'placeholder',
      })
    );
    console.log('Coordinator registered');
  } catch (error: any) {
    if (error.response?.status !== 409) {
      console.error('Registration error:', error.message);
    }
  }
}

// Main coordination loop
async function coordinate() {
  console.log('Running coordination cycle...');
  
  try {
    // Rate limit: Max 5 tasks per batch, then 2-min break
    let taskCount = 0;
    
    // Get open tasks
    const tasksResponse = await rateLimitedApiCall(() => 
      axios.get(`${API_URL}/api/tasks`)
    );
    const openTasks = tasksResponse.data.tasks || [];
    
    console.log(`Found ${openTasks.length} open tasks`);
    
    for (const task of openTasks) {
      if (taskCount >= 5) {
        console.log('Rate limit: 5 tasks processed, taking 2-min break');
        await new Promise(r => setTimeout(r, 120000));
        taskCount = 0;
      }
      
      if (task.bids && task.bids.length > 0) continue;
      
      console.log(`Finding agents for: ${task.title}`);
      
      const matchResponse = await rateLimitedApiCall(() =>
        axios.post(`${API_URL}/api/matching/find-agents`, {
          taskId: task.id,
        })
      );
      
      const matches = matchResponse.data.matches || [];
      
      if (matches.length > 0) {
        const topMatch = matches[0];
        console.log(`Best match: ${topMatch.agent.name} (score: ${topMatch.score})`);
        taskCount++;
      }
    }
    
    // Update status
    await rateLimitedApiCall(() =>
      axios.post(`${API_URL}/api/agents/${COORDINATOR_ID}/status`, {
        status: 'available',
      })
    );
    
  } catch (error: any) {
    console.error('Coordination error:', error.message);
  }
}

async function main() {
  console.log('Starting GigClaw Coordinator...');
  
  await register();
  await coordinate();
  
  // Run every 60 seconds (not every 30 to reduce API calls)
  setInterval(coordinate, 60000);
  
  console.log('Coordinator running');
}

main().catch(console.error);
