#!/usr/bin/env node
/**
 * GigClaw + SIDEX Integration Demo
 * 
 * Shows how a trading agent executes tasks through SIDEX
 * Run: npx ts-node demo/sidex-integration-demo.ts
 */

import { GigClawSIDEXIntegration } from '../api/src/integrations/gigclaw-sidex';

async function runDemo() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     GigClaw + SIDEX Integration Demo                      ║');
  console.log('║     Autonomous Trading Through GigClaw Marketplace        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // 1. Initialize the integration
  console.log('📦 Initializing GigClaw-SIDEX integration...\n');
  
  const integration = new GigClawSIDEXIntegration({
    agentId: 'demo-trader-001',
    sidexApiKey: process.env.SIDEX_API_KEY || 'demo-key',
    environment: 'simulation',
    riskLimits: {
      maxPosition: 1000,
      maxDrawdown: 100,
      maxLeverage: 5
    }
  });

  // 2. Simulate GigClaw posting a trading task
  console.log('📝 Step 1: Coordinator agent posts trading task on GigClaw\n');
  
  const tradingTask = {
    taskId: `trade-${Date.now()}`,
    strategy: 'arbitrage' as const,
    pair: 'SOLUSDT',
    parameters: {
      entryConditions: 'Spread > 0.5% between exchanges',
      exitConditions: 'Spread < 0.1% or timeout',
      positionSize: 100,
      stopLoss: 0.02,
      takeProfit: 0.05
    },
    timeout: 60000 // 1 minute demo timeout
  };

  console.log('Task Details:');
  console.log(`  ID: ${tradingTask.taskId}`);
  console.log(`  Strategy: ${tradingTask.strategy}`);
  console.log(`  Pair: ${tradingTask.pair}`);
  console.log(`  Position: ${tradingTask.parameters.positionSize} USDC`);
  console.log(`  Timeout: ${tradingTask.timeout / 1000}s\n`);

  // 3. Execution agent accepts and executes
  console.log('⚡ Step 2: Execution agent accepts task via SIDEX\n');
  
  console.log('Executing trading strategy...\n');
  
  const startTime = Date.now();
  const result = await integration.executeTradingTask(tradingTask);
  const executionTime = Date.now() - startTime;

  // 4. Show results
  console.log('\n📊 Step 3: Execution Results\n');
  
  console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Execution Time: ${result.executionTime}ms`);
  console.log(`PnL: ${result.pnl > 0 ? '+' : ''}${result.pnl.toFixed(2)} USDC`);
  console.log(`Trades: ${result.trades.length}`);
  
  if (result.trades.length > 0) {
    console.log('\nTrade History:');
    result.trades.forEach((trade, i) => {
      console.log(`  ${i + 1}. ${trade.side.toUpperCase()} ${trade.amount} ${trade.pair} @ $${trade.price.toFixed(2)}`);
    });
  }

  console.log('\nDecision Process:');
  console.log(`  ${result.evidence.decisionProcess}`);

  // 5. Show performance metrics
  console.log('\n📈 Performance Metrics\n');
  
  const metrics = integration.getPerformanceMetrics();
  console.log(`Total Tasks: ${metrics.totalTasks}`);
  console.log(`Successful: ${metrics.successfulTasks}`);
  console.log(`Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
  console.log(`Total PnL: ${metrics.totalPnL > 0 ? '+' : ''}${metrics.totalPnL.toFixed(2)} USDC`);
  console.log(`Avg Execution: ${metrics.avgExecutionTime.toFixed(0)}ms`);

  // 6. Verification for GigClaw
  console.log('\n✅ Step 4: Verification & Payment\n');
  
  console.log('GigClaw Verification:');
  console.log(`  Task ID: ${result.taskId}`);
  console.log(`  Evidence Hash: ${Buffer.from(JSON.stringify(result.evidence)).toString('base64').slice(0, 16)}...`);
  console.log(`  Status: ${result.status}`);
  console.log(`  Payment: ${result.success ? 'Released to agent' : 'Held for review'}`);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Demo Complete!                                           ║');
  console.log('║  This is how GigClaw + SIDEX enable autonomous trading   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  console.log('Integration Flow:');
  console.log('  1. Coordinator posts task on GigClaw');
  console.log('  2. Execution agent accepts via SIDEX');
  console.log('  3. SIDEX executes trading strategy');
  console.log('  4. Results verified on-chain');
  console.log('  5. Payment released automatically\n');
}

// Run the demo
runDemo().catch(console.error);
