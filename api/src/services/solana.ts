import { Connection, PublicKey, Keypair, clusterApiUrl, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';

const PROGRAM_ID = new PublicKey('4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6');
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC

let connection: Connection | null = null;
let provider: AnchorProvider | null = null;
let program: any = null;
let fundedWallet: Keypair | null = null;

// Initialize funded wallet from environment
function getFundedWallet(): Keypair {
  if (!fundedWallet) {
    const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyBase58) {
      throw new Error('SOLANA_PRIVATE_KEY not set in environment');
    }
    
    // Decode base58 private key
    const secretKey = Buffer.from(require('bs58').decode(privateKeyBase58));
    fundedWallet = Keypair.fromSecretKey(secretKey);
    console.log('[Solana] Loaded funded wallet:', fundedWallet.publicKey.toBase58());
  }
  return fundedWallet;
}

// IDL for the GigClaw program
const IDL = {
  "version": "0.1.0",
  "name": "gigclaw",
  "instructions": [
    {
      "name": "createTask",
      "accounts": [
        { "name": "task", "isMut": true, "isSigner": false },
        { "name": "poster", "isMut": true, "isSigner": true },
        { "name": "posterTokenAccount", "isMut": true, "isSigner": false },
        { "name": "escrowAccount", "isMut": true, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "taskId", "type": "string" },
        { "name": "title", "type": "string" },
        { "name": "description", "type": "string" },
        { "name": "budget", "type": "u64" },
        { "name": "deadline", "type": "i64" },
        { "name": "requiredSkills", "type": { "vec": "string" } }
      ]
    },
    {
      "name": "bidOnTask",
      "accounts": [
        { "name": "task", "isMut": true, "isSigner": false },
        { "name": "bid", "isMut": true, "isSigner": false },
        { "name": "bidder", "isMut": true, "isSigner": true },
        { "name": "bidderReputation", "isMut": true, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "bidAmount", "type": "u64" },
        { "name": "estimatedDuration", "type": "i64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Task",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "taskId", "type": "string" },
          { "name": "poster", "type": "publicKey" },
          { "name": "title", "type": "string" },
          { "name": "description", "type": "string" },
          { "name": "budget", "type": "u64" },
          { "name": "finalBudget", "type": "u64" },
          { "name": "deadline", "type": "i64" },
          { "name": "requiredSkills", "type": { "vec": "string" } },
          { "name": "status", "type": { "defined": "TaskStatus" } },
          { "name": "assignedAgent", "type": { "option": "publicKey" } },
          { "name": "createdAt", "type": "i64" },
          { "name": "completedAt", "type": { "option": "i64" } },
          { "name": "deliveryUrl", "type": { "option": "string" } },
          { "name": "escrowBump", "type": "u8" },
          { "name": "disputeReason", "type": { "option": "string" } },
          { "name": "disputeInitiator", "type": { "option": "publicKey" } },
          { "name": "disputeCreatedAt", "type": { "option": "i64" } }
        ]
      }
    },
    {
      "name": "Bid",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "task", "type": "publicKey" },
          { "name": "bidder", "type": "publicKey" },
          { "name": "amount", "type": "u64" },
          { "name": "estimatedDuration", "type": "i64" },
          { "name": "createdAt", "type": "i64" },
          { "name": "status", "type": { "defined": "BidStatus" } }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "TaskStatus",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Posted" },
          { "name": "Bidding" },
          { "name": "Assigned" },
          { "name": "InProgress" },
          { "name": "UnderReview" },
          { "name": "Completed" },
          { "name": "Disputed" },
          { "name": "Resolved" },
          { "name": "Cancelled" }
        ]
      }
    },
    {
      "name": "BidStatus",
      "type": {
        "kind": "enum",
        "variants": [
          { "name": "Active" },
          { "name": "Accepted" },
          { "name": "Rejected" },
          { "name": "Withdrawn" }
        ]
      }
    }
  ],
  "errors": [
    { "code": 6000, "name": "InvalidTaskId", "msg": "Task ID must be between 1 and 32 characters" },
    { "code": 6001, "name": "InvalidTitle", "msg": "Title must be between 1 and 100 characters" },
    { "code": 6002, "name": "InvalidDescription", "msg": "Description must not exceed 2000 characters" },
    { "code": 6003, "name": "BudgetTooLow", "msg": "Budget must be at least 1 USDC" },
    { "code": 6004, "name": "InvalidDeadline", "msg": "Deadline must be between 1 and 90 days from now" },
    { "code": 6005, "name": "TooManySkills", "msg": "Cannot specify more than 10 skills" },
    { "code": 6006, "name": "InvalidSkill", "msg": "Skill name must be between 1 and 50 characters" },
    { "code": 6007, "name": "ArithmeticOverflow", "msg": "Arithmetic operation overflowed" },
    { "code": 6008, "name": "TaskNotOpen", "msg": "Task is not open for bidding" },
    { "code": 6009, "name": "BidTooHigh", "msg": "Bid cannot exceed task budget" },
    { "code": 6010, "name": "DeadlinePassed", "msg": "Task deadline has passed" },
    { "code": 6011, "name": "InsufficientReputation", "msg": "Insufficient reputation to bid" },
    { "code": 6012, "name": "TaskNotAssigned", "msg": "Task is not assigned to this agent" },
    { "code": 6013, "name": "NotTaskPoster", "msg": "Only the task poster can perform this action" },
    { "code": 6014, "name": "NotAssignedAgent", "msg": "Only the assigned agent can perform this action" },
    { "code": 6015, "name": "DisputeTimeout", "msg": "Dispute resolution timeout has passed" },
    { "code": 6016, "name": "InvalidStatus", "msg": "Invalid task status for this operation" },
    { "code": 6017, "name": "InsufficientFunds", "msg": "Insufficient funds for this operation" },
    { "code": 6018, "name": "Unauthorized", "msg": "Unauthorized to perform this action" },
    { "code": 6019, "name": "TransferFailed", "msg": "Token transfer failed" },
    { "code": 6020, "name": "InvalidAmount", "msg": "Invalid amount specified" },
    { "code": 6021, "name": "AlreadyCompleted", "msg": "Task has already been completed" },
    { "code": 6022, "name": "AlreadyDisputed", "msg": "Task has already been disputed" },
    { "code": 6023, "name": "DisputeNotFound", "msg": "Dispute not found for this task" }
  ]
};

export function getConnection(): Connection {
  if (!connection) {
    const endpoint = NETWORK === 'mainnet' 
      ? process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com'
      : clusterApiUrl('devnet');
    connection = new Connection(endpoint, 'confirmed');
  }
  return connection;
}

export function getProvider(): AnchorProvider {
  if (!provider) {
    const conn = getConnection();
    const wallet = new NodeWallet(getFundedWallet());
    provider = new AnchorProvider(conn, wallet, {
      commitment: 'confirmed'
    });
  }
  return provider;
}

export function getProgram(): Program {
  if (!program) {
    const prov = getProvider();
    program = new Program(IDL as any, PROGRAM_ID, prov);
  }
  return program;
}

export async function getProgramState() {
  try {
    const conn = getConnection();
    const accountInfo = await conn.getAccountInfo(PROGRAM_ID);
    
    if (!accountInfo) {
      return { status: 'not_deployed', message: 'Program not found on chain' };
    }
    
    const balance = await conn.getBalance(PROGRAM_ID);
    
    return {
      status: 'active',
      programId: PROGRAM_ID.toBase58(),
      network: NETWORK,
      balance: balance / 1e9,
      executable: accountInfo.executable,
      owner: accountInfo.owner.toBase58(),
      dataSize: accountInfo.data.length
    };
  } catch (error: any) {
    return { 
      status: 'error', 
      message: error.message,
      network: NETWORK 
    };
  }
}

// Get all tasks from the blockchain
export async function getTasksFromChain(): Promise<any[]> {
  try {
    const prog = getProgram();
    // @ts-ignore
    const tasks = await prog.account.task.all();
    
    return tasks.map((t: any) => ({
      id: t.account.taskId,
      title: t.account.title,
      description: t.account.description,
      budget: t.account.budget.toNumber() / 1e6,
      deadline: new Date(t.account.deadline.toNumber() * 1000).toISOString(),
      requiredSkills: t.account.requiredSkills,
      status: Object.keys(t.account.status)[0].toLowerCase(),
      posterId: t.account.poster.toBase58(),
      assignedAgent: t.account.assignedAgent?.toBase58() || null,
      createdAt: new Date(t.account.createdAt.toNumber() * 1000).toISOString(),
      onChain: true
    }));
  } catch (error: any) {
    console.error('[Solana] Error fetching tasks:', error.message);
    return [];
  }
}

// Create task on blockchain with real transaction
export async function createTaskOnChain(
  taskId: string,
  title: string,
  description: string,
  budget: number,
  deadline: Date,
  requiredSkills: string[]
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const conn = getConnection();
    const wallet = getFundedWallet();
    const prov = new AnchorProvider(conn, new NodeWallet(wallet), { commitment: 'confirmed' });
    const prog = new Program(IDL as any, PROGRAM_ID, prov);
    
    // Derive PDA for task account
    const [taskPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('task'), Buffer.from(taskId)],
      PROGRAM_ID
    );
    
    // Derive escrow PDA
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), Buffer.from(taskId)],
      PROGRAM_ID
    );
    
    // Get poster's USDC token account
    const posterTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT_DEVNET,
      wallet.publicKey
    );
    
    console.log('[Solana] Creating task on chain...');
    console.log('[Solana] Task ID:', taskId);
    console.log('[Solana] Budget:', budget, 'USDC');
    console.log('[Solana] Task PDA:', taskPDA.toBase58());
    
    // Call program instruction
    const tx = await prog.methods
      .createTask(
        taskId,
        title,
        description,
        new BN(budget * 1e6),
        new BN(Math.floor(deadline.getTime() / 1000)),
        requiredSkills
      )
      .accounts({
        task: taskPDA,
        poster: wallet.publicKey,
        posterTokenAccount: posterTokenAccount,
        escrowAccount: escrowPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    console.log('[Solana] Transaction successful:', tx);
    
    return {
      success: true,
      signature: tx
    };
  } catch (error: any) {
    console.error('[Solana] Error creating task:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getTaskCount(): Promise<number> {
  try {
    const tasks = await getTasksFromChain();
    return tasks.length;
  } catch (error) {
    return 0;
  }
}

export { PROGRAM_ID, NETWORK, USDC_MINT_DEVNET };
