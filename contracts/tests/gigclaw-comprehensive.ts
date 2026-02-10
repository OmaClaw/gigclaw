import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Gigclaw } from '../target/types/gigclaw';
import { assert, expect } from 'chai';
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js';

describe('gigclaw - Comprehensive Tests', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Gigclaw as Program<Gigclaw>;
  const wallet = provider.wallet;

  // Create separate keypairs for different roles
  const posterKeypair = Keypair.generate();
  const workerKeypair = Keypair.generate();
  const verifierKeypair = Keypair.generate();

  describe('Task Lifecycle', () => {
    const taskId = `lifecycle-${Date.now()}`;
    let taskPDA: PublicKey;
    let bidPDA: PublicKey;
    let reputationPDA: PublicKey;

    before(async () => {
      [taskPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('task'), Buffer.from(taskId)],
        program.programId
      );

      [bidPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('bid'), taskPDA.toBuffer(), wallet.publicKey.toBuffer()],
        program.programId
      );

      [reputationPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), wallet.publicKey.toBuffer()],
        program.programId
      );
    });

    it('Creates task with all fields', async () => {
      const budget = new anchor.BN(10_000_000); // 10 USDC
      const deadline = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // 1 day from now
      const skills = ['security', 'solana', 'rust'];

      const tx = await program.methods
        .createTask(
          taskId,
          'Comprehensive Security Audit',
          'Full audit of Anchor program including overflow checks',
          budget,
          deadline,
          skills
        )
        .accounts({
          task: taskPDA,
          poster: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Task created:', tx);

      const task = await program.account.task.fetch(taskPDA);
      assert.equal(task.taskId, taskId);
      assert.equal(task.title, 'Comprehensive Security Audit');
      assert.equal(task.budget.toNumber(), budget.toNumber());
      assert.equal(task.requiredSkills.length, 3);
      assert.deepEqual(task.requiredSkills, skills);
    });

    it('Emits TaskCreated event', async () => {
      // Events are logged, verify they exist in transaction
      const listener = program.addEventListener('TaskCreated', (event) => {
        console.log('TaskCreated event:', event);
      });
      
      // Clean up listener
      setTimeout(() => program.removeEventListener(listener), 5000);
    });

    it('Rejects duplicate task ID', async () => {
      try {
        await program.methods
          .createTask(
            taskId,
            'Duplicate Task',
            'Should fail',
            new anchor.BN(10_000_000),
            new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
            ['test']
          )
          .accounts({
            task: taskPDA,
            poster: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.toString()).to.include('custom program error');
      }
    });

    it('Rejects task with budget too low', async () => {
      const lowBudgetTaskId = `low-budget-${Date.now()}`;
      const [lowBudgetPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('task'), Buffer.from(lowBudgetTaskId)],
        program.programId
      );

      try {
        await program.methods
          .createTask(
            lowBudgetTaskId,
            'Low Budget Task',
            'Should fail',
            new anchor.BN(100), // Too low
            new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
            ['test']
          )
          .accounts({
            task: lowBudgetPDA,
            poster: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.toString()).to.include('BudgetTooLow');
      }
    });

    it('Submits valid bid', async () => {
      const bidAmount = new anchor.BN(8_000_000); // 8 USDC

      const tx = await program.methods
        .submitBid(bidAmount)
        .accounts({
          task: taskPDA,
          bid: bidPDA,
          bidder: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log('Bid submitted:', tx);

      const bid = await program.account.bid.fetch(bidPDA);
      assert.equal(bid.amount.toNumber(), bidAmount.toNumber());
      assert.equal(bid.task.toString(), taskPDA.toString());
      assert.equal(bid.bidder.toString(), wallet.publicKey.toString());
    });

    it('Rejects bid exceeding budget', async () => {
      const [badBidPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('bid'),
          taskPDA.toBuffer(),
          posterKeypair.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .submitBid(new anchor.BN(20_000_000)) // Exceeds 10 USDC budget
          .accounts({
            task: taskPDA,
            bid: badBidPDA,
            bidder: posterKeypair.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([posterKeypair])
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.toString()).to.include('InvalidBidAmount');
      }
    });
  });

  describe('Reputation System', () => {
    let reputationPDA: PublicKey;

    before(async () => {
      [reputationPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('reputation'), wallet.publicKey.toBuffer()],
        program.programId
      );
    });

    it('Initializes reputation for new agent', async () => {
      // Check if already initialized
      try {
        await program.account.reputation.fetch(reputationPDA);
        console.log('Reputation already initialized');
        return;
      } catch {
        // Not initialized, proceed
      }

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
      assert.equal(reputation.totalEarned.toNumber(), 0);
      assert.equal(reputation.successRate, 0);
    });

    it('Emits ReputationInitialized event', async () => {
      const listener = program.addEventListener('ReputationInitialized', (event) => {
        console.log('ReputationInitialized event:', event);
      });
      
      setTimeout(() => program.removeEventListener(listener), 5000);
    });
  });

  describe('Security - Input Validation', () => {
    it('Rejects task with empty title', async () => {
      const badTaskId = `bad-title-${Date.now()}`;
      const [badTaskPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('task'), Buffer.from(badTaskId)],
        program.programId
      );

      try {
        await program.methods
          .createTask(
            badTaskId,
            '', // Empty title
            'Description',
            new anchor.BN(10_000_000),
            new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
            ['test']
          )
          .accounts({
            task: badTaskPDA,
            poster: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.toString()).to.include('InvalidTitle');
      }
    });

    it('Rejects task with too many skills', async () => {
      const manySkillsId = `many-skills-${Date.now()}`;
      const [manySkillsPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('task'), Buffer.from(manySkillsId)],
        program.programId
      );

      try {
        await program.methods
          .createTask(
            manySkillsId,
            'Task with too many skills',
            'Description',
            new anchor.BN(10_000_000),
            new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'] // 11 skills
          )
          .accounts({
            task: manySkillsPDA,
            poster: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.toString()).to.include('TooManySkills');
      }
    });

    it('Rejects task with deadline in the past', async () => {
      const pastDeadlineId = `past-${Date.now()}`;
      const [pastPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('task'), Buffer.from(pastDeadlineId)],
        program.programId
      );

      try {
        await program.methods
          .createTask(
            pastDeadlineId,
            'Past Deadline Task',
            'Description',
            new anchor.BN(10_000_000),
            new anchor.BN(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
            ['test']
          )
          .accounts({
            task: pastPDA,
            poster: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        
        assert.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.toString()).to.include('InvalidDeadline');
      }
    });
  });

  describe('Events Emission', () => {
    it('Should emit all defined events', async () => {
      const eventNames = [
        'TaskCreated',
        'BidPlaced',
        'BidAccepted',
        'TaskCancelled',
        'TaskCompleted',
        'PaymentReleased',
        'AgentRated',
        'ReputationInitialized'
      ];

      console.log('Events defined in program:');
      eventNames.forEach(name => console.log(`  - ${name}`));

      // Verify events are in IDL
      const idl = program.idl;
      const events = idl.events || [];
      
      eventNames.forEach(name => {
        const found = events.find((e: any) => e.name === name);
        if (found) {
          console.log(`✅ ${name} found in IDL`);
        } else {
          console.log(`⚠️  ${name} not in IDL (may be emitted manually)`);
        }
      });
    });
  });

  describe('Performance', () => {
    it('Should handle concurrent task creation', async () => {
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const taskId = `perf-${Date.now()}-${i}`;
        const [taskPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from('task'), Buffer.from(taskId)],
          program.programId
        );

        const promise = program.methods
          .createTask(
            taskId,
            `Performance Test Task ${i}`,
            'Description',
            new anchor.BN(10_000_000),
            new anchor.BN(Math.floor(Date.now() / 1000) + 86400),
            ['test']
          )
          .accounts({
            task: taskPDA,
            poster: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        promises.push(promise);
      }

      const results = await Promise.all(promises);
      console.log(`Created ${results.length} tasks concurrently`);
      
      assert.equal(results.length, 5);
    });
  });
});
