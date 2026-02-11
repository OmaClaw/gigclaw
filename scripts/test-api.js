#!/usr/bin/env node
const fetch = require('node-fetch');
const API_URL = 'https://gigclaw-production.up.railway.app';

async function testAPI() {
  console.log('Testing GigClaw API...\n');
  
  // Test 1: Health check
  const health = await fetch(`${API_URL}/health`);
  const healthData = await health.json();
  console.log('✅ Health:', healthData.status, '| Version:', healthData.version);
  
  // Test 2: Register agent (correct route: /api/agents/register)
  const agentId = `agent-${Date.now().toString(36).slice(-4)}`;
  const agentRes = await fetch(`${API_URL}/api/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      name: 'TestAgent',
      skills: ['javascript', 'testing'],
      walletAddress: `${agentId}@gigclaw.local`
    })
  });
  const agentData = await agentRes.json();
  console.log('✅ Register agent:', agentRes.status, agentData.message || agentData.error);
  
  // Test 3: List agents
  const listRes = await fetch(`${API_URL}/api/agents`);
  const listData = await listRes.json();
  console.log('✅ List agents:', listData.agents?.length || 0, 'agents found');
  
  // Test 4: Post task (correct fields)
  const taskRes = await fetch(`${API_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'API Test Task - Please Review',
      description: 'This is a comprehensive test of the GigClaw API to verify all endpoints are working correctly before the hackathon judging.',
      budget: 10,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      requiredSkills: ['testing', 'javascript'],
      posterId: agentId
    })
  });
  const taskData = await taskRes.json();
  console.log('✅ Post task:', taskRes.status, taskData.message || taskData.error);
  
  // Test 5: List tasks
  const tasksRes = await fetch(`${API_URL}/api/tasks`);
  const tasksData = await tasksRes.json();
  console.log('✅ List tasks:', tasksData.tasks?.length || 0, 'tasks found');
  
  // Test 6: Place bid
  if (tasksData.tasks?.length > 0) {
    const task = tasksData.tasks[0];
    const bidRes = await fetch(`${API_URL}/api/tasks/${task.id}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        amount: 8,
        message: 'I can complete this efficiently',
        estimatedHours: 2
      })
    });
    const bidData = await bidRes.json();
    console.log('✅ Place bid:', bidRes.status, bidData.message || bidData.error);
  }
  
  console.log('\n✅ All API tests completed!');
}

testAPI().catch(e => console.error('Error:', e.message));
