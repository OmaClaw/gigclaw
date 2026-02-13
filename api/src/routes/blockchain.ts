import { Router } from 'express';
import { 
  getProgramState, 
  getTaskCount, 
  PROGRAM_ID, 
  NETWORK,
  getConnection 
} from '../services/solana';

export const blockchainRouter = Router();

// Get blockchain status
blockchainRouter.get('/status', async (req, res) => {
  try {
    const state = await getProgramState();
    const taskCount = await getTaskCount();
    
    res.json({
      ...state,
      onChainTasks: taskCount,
      apiTasks: 'Check /api/tasks (hybrid: database + blockchain)',
      note: 'Tasks stored in Railway PostgreSQL with optional Solana blockchain writes for escrow.',
      deployment: {
        programId: PROGRAM_ID.toBase58(),
        network: NETWORK,
        explorer: `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=${NETWORK}`
      }
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get blockchain status',
      message: error.message
    });
  }
});

// Get program details
blockchainRouter.get('/program', async (req, res) => {
  try {
    const conn = getConnection();
    const accountInfo = await conn.getAccountInfo(PROGRAM_ID);
    
    if (!accountInfo) {
      return res.status(404).json({
        error: 'Program not found',
        programId: PROGRAM_ID.toBase58(),
        network: NETWORK
      });
    }
    
    res.json({
      programId: PROGRAM_ID.toBase58(),
      network: NETWORK,
      executable: accountInfo.executable,
      owner: accountInfo.owner.toBase58(),
      lamports: accountInfo.lamports,
      dataSize: accountInfo.data.length,
      explorer: `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=${NETWORK}`
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get program info',
      message: error.message
    });
  }
});

// Verify transaction
blockchainRouter.get('/verify/:signature', async (req, res) => {
  try {
    const { signature } = req.params;
    const conn = getConnection();
    
    const status = await conn.getSignatureStatus(signature);
    
    res.json({
      signature,
      status: status?.value?.confirmationStatus || 'unknown',
      err: status?.value?.err,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to verify transaction',
      message: error.message
    });
  }
});
