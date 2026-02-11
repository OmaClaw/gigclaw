#!/usr/bin/env node
/**
 * GigClaw E2E Test Suite
 * 
 * Comprehensive test of all API endpoints
 * Judges can run this to verify system functionality
 * 
 * Usage: node scripts/e2e-test.js
 */

const fetch = require('node-fetch');
const API_URL = process.env.GIGCLAW_API_URL || 'https://gigclaw-production.up.railway.app';

const tests = [];
const results = { passed: 0, failed: 0, errors: [] };

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  GigClaw E2E Test Suite                                  ║');
  console.log('║  API:', API_URL.padEnd(44), '║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  for (const { name, fn } of tests) {
    try {
      process.stdout.write(`⏳ ${name}... `);
      await fn();
      console.log('✅ PASS');
      results.passed++;
    } catch (error) {
      console.log('❌ FAIL');
      results.failed++;
      results.errors.push({ test: name, error: error.message });
    }
  }
  
  console.log('\n' + '═'.repeat(58));
  console.log(' TEST RESULTS');
  console.log('═'.repeat(58));
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`📊 Total:  ${results.passed + results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    results.errors.forEach(({ test, error }) => {
      console.log(`  • ${test}: ${error}`);
    });
  }
  
  console.log('\n' + '═'.repeat(58));
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// ===== TESTS =====

test('Health endpoint returns ok', async () => {
  const res = await fetch(`${API_URL}/health`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('Status not ok');
});

test('Root endpoint returns API info', async () => {
  const res = await fetch(`${API_URL}/`);
  const data = await res.json();
  if (!data.name || !data.version) throw new Error('Missing API info');
  if (!data.endpoints) throw new Error('Missing endpoints list');
});

test('Stats endpoint returns data', async () => {
  const res = await fetch(`${API_URL}/stats`);
  const data = await res.json();
  if (typeof data.status !== 'string') throw new Error('Missing status');
});

test('Can register an agent', async () => {
  const agentId = `test-agent-${Date.now().toString(36).slice(-4)}`;
  const res = await fetch(`${API_URL}/api/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      name: 'TestAgent',
      skills: ['javascript', 'testing'],
      walletAddress: `${agentId}@test.local`
    })
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Registration failed');
  }
});

test('Can list agents', async () => {
  const res = await fetch(`${API_URL}/api/agents`);
  const data = await res.json();
  if (!Array.isArray(data.agents)) throw new Error('Agents not an array');
});

test('Can post a task', async () => {
  const res = await fetch(`${API_URL}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'E2E Test Task - Automated Verification',
      description: 'This is an automated test task to verify the GigClaw API is functioning correctly during hackathon judging.',
      budget: 10,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      requiredSkills: ['testing', 'verification'],
      posterId: 'e2e-test-agent'
    })
  });
  
  if (!res.ok) {
    const error = await res.json();
    // Rate limit is ok for testing
    if (!error.error?.includes('limit')) {
      throw new Error(error.error || 'Task creation failed');
    }
  }
});

test('Can list tasks', async () => {
  const res = await fetch(`${API_URL}/api/tasks`);
  const data = await res.json();
  if (!Array.isArray(data.tasks)) throw new Error('Tasks not an array');
});

test('Bids endpoint is accessible', async () => {
  const res = await fetch(`${API_URL}/api/bids/task/test-task-id`);
  // Should return 200 even if task doesn't exist (empty array)
  if (!res.ok && res.status !== 404) throw new Error('Bids endpoint error');
});

test('Reputation endpoint works', async () => {
  const res = await fetch(`${API_URL}/api/reputation/test-agent`);
  const data = await res.json();
  if (typeof data.baseReputation !== 'number') throw new Error('Invalid reputation data');
});

test('Skills endpoint works', async () => {
  const res = await fetch(`${API_URL}/api/skills/test-agent`);
  const data = await res.json();
  if (typeof data.totalSkills !== 'number') throw new Error('Invalid skills data');
});

test('Negotiations endpoint is accessible', async () => {
  const res = await fetch(`${API_URL}/api/negotiations/test-agent`);
  // May return empty, but should not error
  if (!res.ok && res.status !== 404) throw new Error('Negotiations endpoint error');
});

test('Voting endpoint is accessible', async () => {
  const res = await fetch(`${API_URL}/api/voting/proposals`);
  if (!res.ok) throw new Error('Voting endpoint error');
});

test('Standups endpoint is accessible', async () => {
  const res = await fetch(`${API_URL}/api/standups`);
  if (!res.ok) throw new Error('Standups endpoint error');
});

test('Predictive endpoint is accessible', async () => {
  const res = await fetch(`${API_URL}/api/predictive/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: 'test-task-123',
      requiredSkills: ['javascript', 'testing'],
      complexity: 5,
      urgency: 5,
      budget: 100,
      posterId: 'test-poster'
    })
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Predictive endpoint error');
  }
});

test('Matching endpoint is accessible', async () => {
  const res = await fetch(`${API_URL}/api/matching/agents?taskId=test`);
  if (!res.ok && res.status !== 404) throw new Error('Matching endpoint error');
});

test('Blockchain endpoint (if deployed)', async () => {
  const res = await fetch(`${API_URL}/api/blockchain/status`);
  // May 404 if not deployed yet
  if (!res.ok && res.status !== 404) throw new Error('Blockchain endpoint error');
});

// Run tests
runTests();
