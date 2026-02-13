import { Connection, PublicKey, Keypair, clusterApiUrl, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PROGRAM_ID = new PublicKey('9bV8oV5f7eaQw6iRdePgaX8jTmCnMAAt4gePqivZ6v91');
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');

let connection: Connection | null = null;
let fundedWallet: Keypair | null = null;

// Initialize funded wallet
function getFundedWallet(): Keypair {
  if (!fundedWallet) {
    const privateKeyBase58 = process.env.SOLANA_PRIVATE_KEY;
    
    if (privateKeyBase58) {
      const secretKey = bs58.decode(privateKeyBase58);
      fundedWallet = Keypair.fromSecretKey(secretKey);
      console.log('[Solana] Loaded wallet from env:', fundedWallet.publicKey.toBase58());
    } else {
      const solanaKeypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
      if (fs.existsSync(solanaKeypairPath)) {
        const keypairJson = JSON.parse(fs.readFileSync(solanaKeypairPath, 'utf-8'));
        const secretKey = new Uint8Array(keypairJson);
        fundedWallet = Keypair.fromSecretKey(secretKey);
        console.log('[Solana] Loaded wallet from file:', fundedWallet.publicKey.toBase58());
      } else {
        throw new Error('SOLANA_PRIVATE_KEY not set');
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
      return { status: 'not_deployed', message: 'Program not found' };
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
    return { status: 'error', message: error.message, network: NETWORK };
  }
}

// Get tasks from blockchain using raw account decoding
export async function getTasksFromChain(): Promise<any[]> {
  try {
    const conn = getConnection();
    
    // Get all accounts owned by our program
    const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
      commitment: 'confirmed',
    });
    
    const tasks: any[] = [];
    
    for (const account of accounts) {
      try {
        // Decode account data manually
        // Task account layout: discriminator(8) + task_id(string) + poster(32) + ...
        const data = account.account.data;
        
        // Skip if too small
        if (data.length < 100) continue;
        
        // Basic decoding (simplified)
        let offset = 8; // Skip discriminator
        
        // Read task_id (string)
        const taskIdLen = data.readUInt32LE(offset);
        offset += 4;
        const taskId = data.slice(offset, offset + taskIdLen).toString('utf8');
        offset += taskIdLen;
        
        // Read poster pubkey (32 bytes)
        const posterPubkey = new PublicKey(data.slice(offset, offset + 32));
        offset += 32;
        
        // Read title (string)
        const titleLen = data.readUInt32LE(offset);
        offset += 4;
        const title = data.slice(offset, offset + titleLen).toString('utf8');
        offset += titleLen;
        
        // Read description (string)
        const descLen = data.readUInt32LE(offset);
        offset += 4;
        const description = data.slice(offset, offset + descLen).toString('utf8');
        offset += descLen;
        
        // Read budget (u64)
        const budget = Number(data.readBigUInt64LE(offset)) / 1e6;
        offset += 8;
        
        tasks.push({
          id: taskId,
          title,
          description,
          budget,
          posterId: posterPubkey.toBase58(),
          onChain: true,
          account: account.pubkey.toBase58()
        });
      } catch (e) {
        // Skip accounts that don't decode properly
        continue;
      }
    }
    
    return tasks;
  } catch (error: any) {
    console.error('[Solana] Error fetching tasks:', error.message);
    return [];
  }
}

// Create task on blockchain - RAW IMPLEMENTATION (no Anchor)
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
    
    console.log('[Solana] Creating task on chain...');
    console.log('[Solana] Task ID:', taskId);
    console.log('[Solana] Budget:', budget, 'USDC');
    
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
    
    console.log('[Solana] Task PDA:', taskPDA.toBase58());
    console.log('[Solana] Escrow PDA:', escrowPDA.toBase58());
    
    // Build instruction data manually
    // Instruction discriminator for create_task (8 bytes)
    // Using raw hash instead of Anchor's derived one
    const discriminator = Buffer.from([0xc2, 0x50, 0x06, 0xb4, 0xe8, 0x7f, 0x30, 0xab]);
    
    // Serialize arguments
    const taskIdBytes = Buffer.from(taskId, 'utf8');
    const taskIdLen = Buffer.alloc(4);
    taskIdLen.writeUInt32LE(taskIdBytes.length, 0);
    
    const titleBytes = Buffer.from(title, 'utf8');
    const titleLen = Buffer.alloc(4);
    titleLen.writeUInt32LE(titleBytes.length, 0);
    
    const descBytes = Buffer.from(description, 'utf8');
    const descLen = Buffer.alloc(4);
    descLen.writeUInt32LE(descBytes.length, 0);
    
    const budgetBuf = Buffer.alloc(8);
    budgetBuf.writeBigUInt64LE(BigInt(Math.floor(budget * 1e6)), 0);
    
    const deadlineBuf = Buffer.alloc(8);
    deadlineBuf.writeBigInt64LE(BigInt(Math.floor(deadline.getTime() / 1000)), 0);
    
    // Serialize skills array
    const skillsLen = Buffer.alloc(4);
    skillsLen.writeUInt32LE(requiredSkills.length, 0);
    const skillsBytes = Buffer.concat(requiredSkills.map(skill => {
      const s = Buffer.from(skill, 'utf8');
      const l = Buffer.alloc(4);
      l.writeUInt32LE(s.length, 0);
      return Buffer.concat([l, s]);
    }));
    
    const data = Buffer.concat([
      discriminator,
      taskIdLen, taskIdBytes,
      titleLen, titleBytes,
      descLen, descBytes,
      budgetBuf,
      deadlineBuf,
      skillsLen, skillsBytes
    ]);
    
    // Build account metas for create_task (simplified - no escrow accounts)
    const keys = [
      { pubkey: taskPDA, isSigner: false, isWritable: true },
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
    ];
    
    // Create instruction
    const instruction = new TransactionInstruction({
      keys,
      programId: PROGRAM_ID,
      data,
    });
    
    // Build and send transaction
    const transaction = new Transaction().add(instruction);
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    // Sign and send
    transaction.sign(wallet);
    
    console.log('[Solana] Sending transaction...');
    
    const signature = await sendAndConfirmTransaction(
      conn,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );
    
    console.log('[Solana] ✅ Transaction successful:', signature);
    
    return {
      success: true,
      signature
    };
  } catch (error: any) {
    console.error('[Solana] ❌ Error creating task:', error.message);
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
