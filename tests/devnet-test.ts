import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Gigclaw } from './target/types/gigclaw';
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

// Devnet configuration
const PROGRAM_ID = new PublicKey('4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6');
const DEVNET_URL = 'https://api.devnet.solana.com';

async function main() {
  console.log('🦞 GigClaw Devnet Contract Testing\n');
  console.log('=====================================\n');

  // Setup connection
  const connection = new Connection(DEVNET_URL, 'confirmed');
  
  // Load deploy keypair
  const deployKeypair = Keypair.fromSecretKey(
    Uint8Array.from(require('/home/oma-claw69/.config/solana/id.json'))
  );
  console.log('Deployer:', deployKeypair.publicKey.toString());
  
  // Check balance
  const balance = await connection.getBalance(deployKeypair.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL\n');

  // Setup provider
  const provider = new anchor.AnchorProvider(
    connection,
    {
      publicKey: deployKeypair.publicKey,
      signTransaction: async (tx) => {
        tx.partialSign(deployKeypair);
        return tx;
      },
      signAllTransactions: async (txs) => {
        txs.forEach(tx => tx.partialSign(deployKeypair));
        return txs;
      }
    },
    { commitment: 'confirmed' }
  );

  // Load program
  const idl = await Program.fetchIdl(PROGRAM_ID, provider);
  if (!idl) {
    console.error('❌ IDL not found on devnet');
    process.exit(1);
  }
  
  const program = new Program(idl, provider);
  console.log('✅ Program loaded:', program.programId.toString());
  console.log('   IDL version:', idl.version || 'unknown\n');

  // Test 1: Create Task
  console.log('📝 Test 1: Create Task');
  const taskId = `task-${Date.now()}`;
  const [taskPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('task'), Buffer.from(taskId)],
    program.programId
  );
  
  try {
    const tx = await program.methods
      .createTask(
        taskId,
        'Test Task from OmaClaw',
        'Testing GigClaw deployment on devnet',
        new anchor.BN(100_000_000), // 100 USDC (6 decimals)
        ['testing', 'devnet']
      )
      .accounts({
        task: taskPDA,
        poster: deployKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('   ✅ Task created:', taskId);
    console.log('   Task PDA:', taskPDA.toString());
    console.log('   Tx:', tx);
    
    // Verify task
    const task = await program.account.task.fetch(taskPDA);
    console.log('   Title:', task.title);
    console.log('   Budget:', task.budget.toNumber() / 1_000_000, 'USDC');
    console.log('   Status:', Object.keys(task.status)[0], '\n');
  } catch (error) {
    console.error('   ❌ Failed:', error.message, '\n');
  }

  // Test 2: Initialize Reputation
  console.log('⭐ Test 2: Initialize Reputation');
  const [reputationPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('reputation'), deployKeypair.publicKey.toBuffer()],
    program.programId
  );
  
  try {
    const tx = await program.methods
      .initializeReputation()
      .accounts({
        reputation: reputationPDA,
        agent: deployKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('   ✅ Reputation initialized');
    console.log('   PDA:', reputationPDA.toString());
    console.log('   Tx:', tx);
    
    const rep = await program.account.reputation.fetch(reputationPDA);
    console.log('   Completed:', rep.completedTasks);
    console.log('   Failed:', rep.failedTasks);
    console.log('   Success Rate:', rep.successRate, '%\n');
  } catch (error) {
    console.error('   ❌ Failed:', error.message, '\n');
  }

  // Summary
  console.log('=====================================');
  console.log('✅ Devnet Testing Complete!');
  console.log('Program:', PROGRAM_ID.toString());
  console.log('Explorer:', `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`);
  console.log('\n🦞 For Agents, By Agents');
}

main().catch(console.error);
