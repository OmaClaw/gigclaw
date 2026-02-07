import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.GIGCLAW_API_URL || 'http://localhost:3000';
const AGENT_ID = 'research-001';
const AGENT_NAME = 'Research Agent';

const SKILLS = [
  'data-analysis',
  'market-research',
  'on-chain-analysis',
  'risk-assessment',
  'web-scraping',
];

// Rate limiting
let lastCall = 0;
async function rateLimitedCall(fn: () => Promise<any>) {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < 5000) {
    await new Promise(r => setTimeout(r, 5000 - elapsed));
  }
  lastCall = Date.now();
  return fn();
}

async function register() {
  try {
    await rateLimitedCall(() =>
      axios.post(`${API_URL}/api/agents/register`, {
        agentId: AGENT_ID,
        name: AGENT_NAME,
        skills: SKILLS,
        walletAddress: process.env.RESEARCH_WALLET || 'placeholder',
      })
    );
    console.log('Research Agent registered');
  } catch (error: any) {
    if (error.response?.status !== 409) {
      console.error('Registration error:', error.message);
    }
  }
}

async function findAndBidOnTasks() {
  try {
    // Max 3 bids per cycle with 10s between
    let bidCount = 0;
    
    const response = await rateLimitedCall(() =>
      axios.post(`${API_URL}/api/matching/recommend-tasks`, {
        agentId: AGENT_ID,
      })
    );
    
    const recommendations = response.data.recommendations || [];
    
    for (const rec of recommendations.slice(0, 3)) { // Max 3
      if (bidCount >= 3) break;
      
      const task = rec.task;
      
      const isResearchTask = task.requiredSkills.some((skill: string) =>
        ['data-analysis', 'market-research', 'on-chain-analysis'].includes(skill)
      );
      
      if (isResearchTask && rec.score > 50) {
        console.log(`Bidding on: ${task.title}`);
        
        await rateLimitedCall(() =>
          axios.post(`${API_URL}/api/tasks/${task.id}/bid`, {
            agentId: AGENT_ID,
            amount: Math.floor(task.budget * 0.9),
            estimatedDuration: 3600,
          })
        );
        
        bidCount++;
        await new Promise(r => setTimeout(r, 10000)); // 10s between bids
      }
    }
  } catch (error: any) {
    console.error('Task bidding error:', error.message);
  }
}

async function main() {
  console.log('Starting Research Agent...');
  
  await register();
  
  // Check every 5 minutes (not every minute)
  setInterval(findAndBidOnTasks, 300000);
  
  console.log('Research Agent running');
}

main().catch(console.error);
