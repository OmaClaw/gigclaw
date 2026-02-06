import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.GIGCLAW_API_URL || 'http://localhost:3000';
const COORDINATOR_ID = 'coordinator-001';
const COORDINATOR_NAME = 'OmaClaw Coordinator';

interface Task {
  id: string;
  title: string;
  description: string;
  budget: number;
  requiredSkills: string[];
  status: string;
  bids: any[];
}

// Register coordinator on startup
async function register() {
  try {
    await axios.post(`${API_URL}/api/agents/register`, {
      agentId: COORDINATOR_ID,
      name: COORDINATOR_NAME,
      skills: ['coordination', 'task-management', 'matching'],
      walletAddress: process.env.COORDINATOR_WALLET || 'placeholder',
    });
    console.log('🦞 Coordinator registered');
  } catch (error: any) {
    if (error.response?.status !== 409) {
      console.error('Registration error:', error.message);
    }
  }
}

// Main coordination loop
async function coordinate() {
  console.log('🔄 Running coordination cycle...');
  
  try {
    // 1. Check for new tasks that need agents
    const tasksResponse = await axios.get(`${API_URL}/api/tasks`);
    const openTasks: Task[] = tasksResponse.data.tasks || [];
    
    console.log(`📋 Found ${openTasks.length} open tasks`);
    
    for (const task of openTasks) {
      // Skip if already has bids
      if (task.bids && task.bids.length > 0) {
        continue;
      }
      
      console.log(`🔍 Finding agents for task: ${task.title}`);
      
      // Find matching agents
      const matchResponse = await axios.post(`${API_URL}/api/matching/find-agents`, {
        taskId: task.id,
      });
      
      const matches = matchResponse.data.matches || [];
      
      if (matches.length > 0) {
        console.log(`✅ Found ${matches.length} potential agents`);
        
        // Auto-bid with top agent (in real scenario, agents would bid themselves)
        const topMatch = matches[0];
        console.log(`🎯 Best match: ${topMatch.agent.name} (score: ${topMatch.score})`);
        
        // Post to Discord about the match
        await postToDiscord({
          event: 'TASK_MATCHED',
          task: task.title,
          agent: topMatch.agent.name,
          score: topMatch.score,
        });
      } else {
        console.log(`⚠️ No matching agents found for task: ${task.title}`);
      }
    }
    
    // 2. Check for completed tasks needing verification
    // (This would check blockchain state in production)
    
    // 3. Update agent availability
    await axios.post(`${API_URL}/api/agents/${COORDINATOR_ID}/status`, {
      status: 'available',
    });
    
  } catch (error: any) {
    console.error('Coordination error:', error.message);
  }
}

// Post status update to Discord (via webhook or bot)
async function postToDiscord(data: any) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('Discord update:', data);
    return;
  }
  
  try {
    await axios.post(webhookUrl, {
      content: `🦞 **GigClaw Update**\nEvent: ${data.event}\nTask: ${data.task || 'N/A'}${data.agent ? `\nAgent: ${data.agent}` : ''}`,
    });
  } catch (error: any) {
    console.error('Discord post error:', error.message);
  }
}

// Main loop
async function main() {
  console.log('🚀 Starting GigClaw Coordinator...');
  
  await register();
  
  // Run immediately
  await coordinate();
  
  // Then every 30 seconds
  setInterval(coordinate, 30000);
  
  console.log('✅ Coordinator running (checking every 30s)');
}

main().catch(console.error);
