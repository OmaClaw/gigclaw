import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import { readFileSync } from 'fs';
import { join } from 'path';

const PROGRAM_ID = new PublicKey('4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6');
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

let connection: Connection | null = null;
let program: any = null;

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
    
    // Get program account info
    const accountInfo = await conn.getAccountInfo(PROGRAM_ID);
    
    if (!accountInfo) {
      return { status: 'not_deployed', message: 'Program not found on chain' };
    }
    
    // Get balance
    const balance = await conn.getBalance(PROGRAM_ID);
    
    return {
      status: 'active',
      programId: PROGRAM_ID.toBase58(),
      network: NETWORK,
      balance: balance / 1e9, // Convert lamports to SOL
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

export async function getTaskCount(): Promise<number> {
  try {
    const conn = getConnection();
    
    // Find all task accounts (PDA seeds: ["task", task_id])
    const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          dataSize: 500, // Approximate task account size
        }
      ]
    });
    
    return accounts.length;
  } catch (error) {
    return 0;
  }
}

export async function syncTaskToChain(taskId: string, taskData: any) {
  // This would create a transaction to store task on-chain
  // For now, we log it and return success
  console.log(`[Solana] Task ${taskId} would be synced to chain`);
  console.log(`[Solana] Data:`, JSON.stringify(taskData, null, 2));
  
  return {
    success: true,
    message: 'Task logged for chain sync (transaction signing required)',
    taskId,
    programId: PROGRAM_ID.toBase58()
  };
}

export async function verifyTaskOnChain(taskId: string): Promise<boolean> {
  try {
    const conn = getConnection();
    
    // Derive PDA for task
    const [taskPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('task'), Buffer.from(taskId)],
      PROGRAM_ID
    );
    
    const account = await conn.getAccountInfo(taskPda);
    return account !== null;
  } catch (error) {
    return false;
  }
}

export { PROGRAM_ID, NETWORK };
