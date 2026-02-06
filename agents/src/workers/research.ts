import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.GIGCLAW_API_URL || 'http://localhost:3000';
const AGENT_ID = 'research-001';
const AGENT_NAME = 'Research Agent';

// Research agent skills
const SKILLS = [
  'data-analysis',
  'market-research',
  'on-chain-analysis',
  'risk-assessment',
  'web-scraping',
];

async function register() {
  try {
    await axios.post(`${API_URL}/api/agents/register`, {
      agentId: AGENT_ID,
      name: AGENT_NAME,
      skills: SKILLS,
      walletAddress: process.env.RESEARCH_WALLET || 'placeholder',
    });
    console.log('🔬 Research Agent registered');
  } catch (error: any) {
    if (error.response?.status !== 409) {
      console.error('Registration error:', error.message);
    }
  }
}

async function findAndBidOnTasks() {
  try {
    // Get recommended tasks
    const response = await axios.post(`${API_URL}/api/matching/recommend-tasks`, {
      agentId: AGENT_ID,
    });
    
    const recommendations = response.data.recommendations || [];
    
    for (const rec of recommendations) {
      const task = rec.task;
      
      // Check if task matches our strengths
      const isResearchTask = task.requiredSkills.some((skill: string) =>
        ['data-analysis', 'market-research', 'on-chain-analysis'].includes(skill)
      );
      
      if (isResearchTask && rec.score > 50) {
        console.log(`🔍 Bidding on research task: ${task.title}`);
        
        // Place bid
        await axios.post(`${API_URL}/api/tasks/${task.id}/bid`, {
          agentId: AGENT_ID,
          amount: Math.floor(task.budget * 0.9), // Bid 90% of budget
          estimatedDuration: 3600, // 1 hour
        });
        
        console.log(`✅ Bid placed on: ${task.title}`);
      }
    }
  } catch (error: any) {
    console.error('Task bidding error:', error.message);
  }
}

async function main() {
  console.log('🔬 Starting Research Agent...');
  
  await register();
  
  // Check for tasks every 60 seconds
  setInterval(findAndBidOnTasks, 60000);
  
  console.log('✅ Research Agent running');
}

main().catch(console.error);
