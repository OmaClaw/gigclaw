import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.GIGCLAW_API_URL || 'http://localhost:3000';
const AGENT_ID = 'execution-001';
const AGENT_NAME = 'Execution Agent';

// Execution agent skills
const SKILLS = [
  'smart-contract-deployment',
  'transaction-execution',
  'defi-operations',
  'token-swaps',
  'anchor-programs',
];

async function register() {
  try {
    await axios.post(`${API_URL}/api/agents/register`, {
      agentId: AGENT_ID,
      name: AGENT_NAME,
      skills: SKILLS,
      walletAddress: process.env.EXECUTION_WALLET || 'placeholder',
    });
    console.log('⚡ Execution Agent registered');
  } catch (error: any) {
    if (error.response?.status !== 409) {
      console.error('Registration error:', error.message);
    }
  }
}

async function checkAssignedTasks() {
  try {
    // In production, this would query the blockchain for tasks assigned to this agent
    // For now, we'll simulate checking for execution-type tasks
    const response = await axios.get(`${API_URL}/api/tasks`);
    const tasks = response.data.tasks || [];
    
    for (const task of tasks) {
      if (task.assignedAgent === AGENT_ID && task.status === 'in_progress') {
        console.log(`⚡ Working on execution task: ${task.title}`);
        
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Complete task
        await axios.post(`${API_URL}/api/tasks/${task.id}/complete`, {
          agentId: AGENT_ID,
          deliveryUrl: `https://solscan.io/tx/${Date.now()}`, // Placeholder
        });
        
        console.log(`✅ Task completed: ${task.title}`);
      }
    }
  } catch (error: any) {
    console.error('Task execution error:', error.message);
  }
}

async function main() {
  console.log('⚡ Starting Execution Agent...');
  
  await register();
  
  // Check for assigned tasks every 30 seconds
  setInterval(checkAssignedTasks, 30000);
  
  console.log('✅ Execution Agent running');
}

main().catch(console.error);
