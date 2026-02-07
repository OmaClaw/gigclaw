import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Gigclaw } from '../target/types/gigclaw';
import { assert } from 'chai';
import { PublicKey, SystemProgram } from '@solana/web3.js';

describe('gigclaw', () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gigclaw as Program<Gigclaw>;
  const wallet = provider.wallet;

  // Test data
  const taskId = `task-${Date.now()}`;
  let taskPDA: PublicKey;
  let bidPDA: PublicKey;
  let reputationPDA: PublicKey;

  before(async () => {
    // Derive PDAs
    [taskPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('task'), Buffer.from(taskId)],
      program.programId
    );

    [bidPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('bid'),
        taskPDA.toBuffer(),
        wallet.publicKey.toBuffer(),
      ],
      program.programId
    );

    [reputationPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('reputation'), wallet.publicKey.toBuffer()],
      program.programId
    );
  });

  it('Creates a task', async () => {
    const budget = new anchor.BN(100_000_000); // 100 USDC
    const skills = ['security', 'solana'];

    await program.methods
      .createTask(taskId, 'Security Audit', 'Audit smart contracts', budget, skills)
      .accounts({
        task: taskPDA,
        poster: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const task = await program.account.task.fetch(taskPDA);
    assert.equal(task.taskId, taskId);
    assert.equal(task.title, 'Security Audit');
    assert.equal(task.budget.toNumber(), budget.toNumber());
    assert.deepEqual(task.requiredSkills, skills);
    assert.equal(task.status.open, undefined); // Status is 'open'
  });

  it('Initializes reputation', async () => {
    await program.methods
      .initializeReputation()
      .accounts({
        reputation: reputationPDA,
        agent: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const reputation = await program.account.reputation.fetch(reputationPDA);
    assert.equal(reputation.agent.toString(), wallet.publicKey.toString());
    assert.equal(reputation.completedTasks, 0);
    assert.equal(reputation.failedTasks, 0);
    assert.equal(reputation.totalEarned.toNumber(), 0);
    assert.equal(reputation.successRate, 0);
  });

  it('Submits a bid', async () => {
    const bidAmount = new anchor.BN(90_000_000); // 90 USDC

    await program.methods
      .submitBid(bidAmount)
      .accounts({
        task: taskPDA,
        bid: bidPDA,
        bidder: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const bid = await program.account.bid.fetch(bidPDA);
    assert.equal(bid.bidder.toString(), wallet.publicKey.toString());
    assert.equal(bid.amount.toNumber(), bidAmount.toNumber());
    assert.equal(bid.task.toString(), taskPDA.toString());
  });

  it('Accepts a bid', async () => {
    await program.methods
      .acceptBid()
      .accounts({
        task: taskPDA,
        bid: bidPDA,
        poster: wallet.publicKey,
      })
      .rpc();

    const task = await program.account.task.fetch(taskPDA);
    const bid = await program.account.bid.fetch(bidPDA);
    
    // Task should be assigned
    assert.equal(task.assignedAgent.toString(), wallet.publicKey.toString());
    assert.equal(task.finalBudget.toNumber(), bid.amount.toNumber());
  });

  it('Completes a task', async () => {
    await program.methods
      .completeTask()
      .accounts({
        task: taskPDA,
        agent: wallet.publicKey,
      })
      .rpc();

    const task = await program.account.task.fetch(taskPDA);
    assert.equal(task.status.completed, undefined); // Status is 'completed'
  });

  // Note: Verify and pay requires token accounts which need setup
  // This is tested in integration tests
});
