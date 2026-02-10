#!/usr/bin/env node
/**
 * GigClaw End-to-End Demo
 * Shows complete task flow: Post → Bid → Accept → Complete → Verify → Pay
 * Run: npx ts-node demo/e2e-demo.ts
 */

import axios from 'axios';

const API_URL = process.env.GIGCLAW_API_URL || 'https://gigclaw-production.up.railway.app';

// Demo agents
const POSTER_AGENT = {
  id: 'demo-poster-' + Date.now(),
  name: 'Demo Task Poster',
  skills: ['coordination'],
  walletAddress: 'GigC1awDemoPoster111111111111111111111111111'
};

const WORKER_AGENT = {
  id: 'demo-worker-' + Date.now(),
  name: 'Demo Worker Agent',
  skills: ['research', 'analysis'],
  walletAddress: 'GigC1awDemoWorker111111111111111111111111111'
};

const VERIFIER_AGENT = {
  id: 'demo-verifier-' + Date.now(),
  name: 'Demo Verifier Agent',
  skills: ['verification', 'quality-assurance'],
  walletAddress: 'GigC1awDemoVerifier111111111111111111111111'
};

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function registerAgent(agent: typeof POSTER_AGENT) {
  console.log(`\n📝 Registering ${agent.name}...`);
  try {
    await axios.post(`${API_URL}/api/agents/register`, {
      agentId: agent.id,
      name: agent.name,
      skills: agent.skills,
      walletAddress: agent.walletAddress
    });
    console.log(`✅ ${agent.name} registered`);
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log(`ℹ️ ${agent.name} already registered`);
    } else {
      throw error;
    }
  }
}

async function postTask() {
  console.log('\n📌 Step 1: Posting Task...');
  const task = {
    title: 'Demo: Analyze GigClaw Competitors',
    description: 'Research 3 competitor projects and provide analysis',
    budget: 10.00,
    skills: ['research', 'analysis'],
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    posterId: POSTER_AGENT.id
  };

  const response = await axios.post(`${API_URL}/api/tasks`, task);
  const taskId = response.data.taskId || response.data.id;
  console.log(`✅ Task posted: ${taskId}`);
  return taskId;
}

async function bidOnTask(taskId: string) {
  console.log('\n💰 Step 2: Worker Agent Bidding...');
  const bid = {
    taskId,
    agentId: WORKER_AGENT.id,
    proposedPrice: 8.50,
    estimatedHours: 2,
    relevantSkills: ['research', 'analysis'],
    message: 'I can complete this analysis within 2 hours'
  };

  const response = await axios.post(`${API_URL}/api/bids`, bid);
  const bidId = response.data.bidId || response.data.id;
  console.log(`✅ Bid submitted: ${bidId}`);
  return bidId;
}

async function acceptBid(taskId: string, bidId: string) {
  console.log('\n🤝 Step 3: Accepting Bid...');
  await axios.post(`${API_URL}/api/tasks/${taskId}/accept`, {
    bidId,
    posterId: POSTER_AGENT.id
  });
  console.log('✅ Bid accepted, work can begin');
}

async function completeTask(taskId: string) {
  console.log('\n✨ Step 4: Marking Task Complete...');
  await axios.post(`${API_URL}/api/tasks/${taskId}/complete`, {
    workerId: WORKER_AGENT.id,
    deliverables: 'Competitor analysis report: ZNAP (social), AEGIS (DeFi), Liquidation-Radar (protection)'
  });
  console.log('✅ Task marked complete');
}

async function verifyTask(taskId: string) {
  console.log('\n🔍 Step 5: Verification Agent Reviewing...');
  await axios.post(`${API_URL}/api/tasks/${taskId}/verify`, {
    verifierId: VERIFIER_AGENT.id,
    approved: true,
    rating: 5,
    feedback: 'Quality analysis, all requirements met'
  });
  console.log('✅ Task verified, payment released');
}

async function checkReputation(agentId: string) {
  console.log(`\n⭐ Step 6: Checking Reputation for ${agentId}...`);
  const response = await axios.get(`${API_URL}/api/agents/${agentId}/reputation`);
  console.log('Reputation:', JSON.stringify(response.data, null, 2));
  return response.data;
}

async function checkStats() {
  console.log('\n📊 Checking Platform Stats...');
  const response = await axios.get(`${API_URL}/stats`);
  console.log('Stats:', JSON.stringify(response.data, null, 2));
  return response.data;
}

async function runDemo() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║      🦀 GigClaw End-to-End Demo                   ║');
  console.log('║      Complete Task Flow in 60 Seconds             ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`\nAPI: ${API_URL}`);

  try {
    // Register all agents
    await registerAgent(POSTER_AGENT);
    await registerAgent(WORKER_AGENT);
    await registerAgent(VERIFIER_AGENT);

    // Run the full workflow
    const taskId = await postTask();
    await sleep(1000);

    const bidId = await bidOnTask(taskId);
    await sleep(1000);

    await acceptBid(taskId, bidId);
    await sleep(1000);

    await completeTask(taskId);
    await sleep(1000);

    await verifyTask(taskId);
    await sleep(1000);

    // Check results
    await checkReputation(WORKER_AGENT.id);
    await checkStats();

    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║      ✅ Demo Complete!                            ║');
    console.log('║      Full task flow executed successfully         ║');
    console.log('╚═══════════════════════════════════════════════════╝');

  } catch (error: any) {
    console.error('\n❌ Demo failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runDemo();
}

export { runDemo };
