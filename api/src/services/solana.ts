import { Connection, PublicKey, Keypair, clusterApiUrl, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PROGRAM_ID = new PublicKey('4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6');
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'); // Devnet USDC
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');

let connection: Connection | null = null;
let fundedWallet: Keypair | null = null;

// Instruction discriminator for create_task (first 8 bytes of sha256("global:create_task"))
const CREATE_TASK_DISCRIMINATOR = Buffer.from([0xc2, 0x50, 0x06, 0xb4, 0xe8, 0x7f, 0x30, 0xab]);

// Initialize funded wallet from environment or Solana CLI keypair file
function getFundedWallet(): Keypair {
  if (!fundedWallet) {
    const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
    
    if (privateKeyBase58) {
      // Use environment variable (Railway/production)
      const secretKey = bs58.decode(privateKeyBase58);
      fundedWallet = Keypair.fromSecretKey(secretKey);
      console.log('[Solana] Loaded funded wallet from env:', fundedWallet.publicKey.toBase58());
    } else {
      // Try to load from Solana CLI keypair file (local development)
      const solanaKeypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
      if (fs.existsSync(solanaKeypairPath)) {
        const keypairJson = JSON.parse(fs.readFileSync(solanaKeypairPath, 'utf-8'));
        const secretKey = new Uint8Array(keypairJson);
        fundedWallet = Keypair.fromSecretKey(secretKey);
        console.log('[Solana] Loaded funded wallet from file:', fundedWallet.publicKey.toBase58());
      } else {
        throw new Error('SOLANA_PRIVATE_KEY not set and no Solana keypair found at ~/.config/solana/id.json');
      }
    }
  }
  return fundedWallet;
}

export function getConnection(): Connection {
  if (!connection) {
    const endpoint = NETWORK === 'mainnet' 
      ? process.env.MAINNET_RPC || 'https://api.mainnet-beta.solana.com'
      : clusterApiUrl('devnet');
    connection = new Connection(endpoint, 'confirmed');
  }
  return connection;
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
  // For now, return empty array since we don't have Anchor to deserialize accounts
  // This would require implementing account decoding manually
  return [];
}

// Serialize string for borsh
function serializeString(str: string): Buffer {
  const strBuffer = Buffer.from(str, 'utf8');
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(strBuffer.length, 0);
  return Buffer.concat([lenBuffer, strBuffer]);
}

// Serialize array of strings
function serializeStringArray(arr: string[]): Buffer {
  const lenBuffer = Buffer.alloc(4);
  lenBuffer.writeUInt32LE(arr.length, 0);
  
  const items = arr.map(serializeString);
  return Buffer.concat([lenBuffer, ...items]);
}

// Serialize u64 (as little-endian 8 bytes)
function serializeU64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  // Use BigInt for values > 2^53
  const bigValue = BigInt.asUintN(64, BigInt(value));
  buf.writeBigUInt64LE(bigValue, 0);
  return buf;
}

// Serialize i64 (as little-endian 8 bytes)
function serializeI64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value), 0);
  return buf;
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
    
    // Serialize instruction data manually
    // discriminator + taskId + title + description + budget + deadline + requiredSkills
    const taskIdData = serializeString(taskId);
    const titleData = serializeString(title);
    const descData = serializeString(description);
    const budgetData = serializeU64(Math.floor(budget * 1e6)); // Convert to USDC lamports
    const deadlineData = serializeI64(Math.floor(deadline.getTime() / 1000));
    const skillsData = serializeStringArray(requiredSkills);
    
    const data = Buffer.concat([
      CREATE_TASK_DISCRIMINATOR,
      taskIdData,
      titleData,
      descData,
      budgetData,
      deadlineData,
      skillsData
    ]);
    
    // Build keys array matching Rust struct order:
    // 1. task, 2. escrow_account, 3. poster, 4. poster_token_account, 5. usdc_mint, 6. token_program, 7. system_program, 8. rent
    const keys = [
      { pubkey: taskPDA, isSigner: false, isWritable: true },      // task
      { pubkey: escrowPDA, isSigner: false, isWritable: true },    // escrow_account
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // poster
      { pubkey: posterTokenAccount, isSigner: false, isWritable: true }, // poster_token_account
      { pubkey: USDC_MINT_DEVNET, isSigner: false, isWritable: false }, // usdc_mint
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false }, // rent
    ];
    
    // Create instruction
    const instruction = new TransactionInstruction({
      keys,
      programId: PROGRAM_ID,
      data,
    });
    
    // Create and sign transaction
    const transaction = new Transaction().add(instruction);
    transaction.feePayer = wallet.publicKey;
    
    const { blockhash } = await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    
    transaction.sign(wallet);
    
    // Send transaction
    const signature = await conn.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    
    // Confirm transaction
    await conn.confirmTransaction(signature, 'confirmed');
    
    console.log('[Solana] Transaction successful:', signature);
    
    return {
      success: true,
      signature
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
  const tasks = await getTasksFromChain();
  return tasks.length;
}

export { PROGRAM_ID, NETWORK, USDC_MINT_DEVNET };
