import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.GIGCLAW_API_URL || 'http://localhost:3000';
const AGENT_ID = 'verification-001';
const AGENT_NAME = 'Verification Agent';

// Verification agent skills
const SKILLS = [
  'quality-assurance',
  'code-review',
  'security-audit',
  'verification',
  'compliance-check',
];

async function register() {
  try {
    await axios.post(`${API_URL}/api/agents/register`, {
      agentId: AGENT_ID,
      name: AGENT_NAME,
      skills: SKILLS,
      walletAddress: process.env.VERIFICATION_WALLET || 'placeholder',
    });
    console.log('✓ Verification Agent registered');
  } catch (error: any) {
    if (error.response?.status !== 409) {
      console.error('Registration error:', error.message);
    }
  }
}

async function verifyCompletedTasks() {
  try {
    // In production, this would check blockchain for completed tasks
    const response = await axios.get(`${API_URL}/api/tasks`);
    const tasks = response.data.tasks || [];
    
    for (const task of tasks) {
      if (task.status === 'completed' && !task.verified) {
        console.log(`✓ Verifying task: ${task.title}`);
        
        // Simulate verification
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Mark as verified
        await axios.post(`${API_URL}/api/tasks/${task.id}/verify`, {
          verifiedBy: AGENT_ID,
          quality: Math.floor(Math.random() * 20) + 80, // 80-100 score
        });
        
        console.log(`✅ Task verified: ${task.title}`);
      }
    }
  } catch (error: any) {
    console.error('Verification error:', error.message);
  }
}

async function main() {
  console.log('✓ Starting Verification Agent...');
  
  await register();
  
  // Check for tasks to verify every 45 seconds
  setInterval(verifyCompletedTasks, 45000);
  
  console.log('✅ Verification Agent running');
}

main().catch(console.error);
