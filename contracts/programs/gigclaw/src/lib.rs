use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod gigclaw {
    use super::*;

    /// Create a new task
    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        title: String,
        description: String,
        budget: u64,
        deadline: i64,
        required_skills: Vec<String>,
    ) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let poster = &ctx.accounts.poster;

        task.task_id = task_id;
        task.poster = poster.key();
        task.title = title;
        task.description = description;
        task.budget = budget;
        task.deadline = deadline;
        task.required_skills = required_skills;
        task.status = TaskStatus::Posted;
        task.assigned_agent = None;
        task.created_at = Clock::get()?.unix_timestamp;
        task.completed_at = None;
        task.escrow_bump = ctx.bumps.escrow_account;

        // Transfer budget to escrow
        let transfer_instruction = Transfer {
            from: ctx.accounts.poster_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: poster.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );

        token::transfer(cpi_ctx, budget)?;

        emit!(TaskCreated {
            task_id: task.task_id.clone(),
            poster: poster.key(),
            budget,
        });

        Ok(())
    }

    /// Bid on a task
    pub fn bid_on_task(
        ctx: Context<BidOnTask>,
        bid_amount: u64,
        estimated_duration: i64,
    ) -> Result<()> {
        let task = &ctx.accounts.task;
        let bidder = &ctx.accounts.bidder;

        require!(task.status == TaskStatus::Posted, ErrorCode::TaskNotOpen);
        require!(bid_amount <= task.budget, ErrorCode::BidTooHigh);

        let bid = &mut ctx.accounts.bid;
        bid.task = task.key();
        bid.bidder = bidder.key();
        bid.amount = bid_amount;
        bid.estimated_duration = estimated_duration;
        bid.created_at = Clock::get()?.unix_timestamp;
        bid.accepted = false;

        emit!(BidPlaced {
            task_id: task.task_id.clone(),
            bidder: bidder.key(),
            amount: bid_amount,
        });

        Ok(())
    }

    /// Accept a bid and assign agent
    pub fn accept_bid(ctx: Context<AcceptBid>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let bid = &ctx.accounts.bid;

        require!(task.status == TaskStatus::Posted, ErrorCode::TaskNotOpen);
        require!(task.poster == ctx.accounts.poster.key(), ErrorCode::Unauthorized);

        task.assigned_agent = Some(bid.bidder);
        task.status = TaskStatus::InProgress;
        task.final_budget = bid.amount;

        emit!(BidAccepted {
            task_id: task.task_id.clone(),
            agent: bid.bidder,
            amount: bid.amount,
        });

        Ok(())
    }

    /// Mark task as completed by assigned agent
    pub fn complete_task(ctx: Context<CompleteTask>, delivery_url: String) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(task.status == TaskStatus::InProgress, ErrorCode::TaskNotInProgress);
        require!(task.assigned_agent == Some(ctx.accounts.agent.key()), ErrorCode::Unauthorized);

        task.status = TaskStatus::Completed;
        task.delivery_url = Some(delivery_url);
        task.completed_at = Some(Clock::get()?.unix_timestamp);

        emit!(TaskCompleted {
            task_id: task.task_id.clone(),
            agent: ctx.accounts.agent.key(),
        });

        Ok(())
    }

    /// Verify and release payment
    pub fn verify_and_pay(ctx: Context<VerifyAndPay>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(task.status == TaskStatus::Completed, ErrorCode::TaskNotCompleted);
        require!(task.poster == ctx.accounts.poster.key(), ErrorCode::Unauthorized);

        // Transfer from escrow to agent
        let transfer_instruction = Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: ctx.accounts.agent_token_account.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        };

        let binding = task.task_id.clone();
        let seeds = &[
            b"escrow",
            binding.as_bytes(),
            &[task.escrow_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
            signer,
        );

        token::transfer(cpi_ctx, task.final_budget)?;

        // Update reputation
        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.completed_tasks += 1;
        reputation.total_earned += task.final_budget;
        reputation.success_rate = (reputation.completed_tasks as u64 * 100) 
            / (reputation.completed_tasks + reputation.failed_tasks).max(1) as u64;

        task.status = TaskStatus::Verified;

        emit!(PaymentReleased {
            task_id: task.task_id.clone(),
            agent: task.assigned_agent.unwrap(),
            amount: task.final_budget,
        });

        Ok(())
    }

    /// Initialize reputation account
    pub fn initialize_reputation(ctx: Context<InitializeReputation>) -> Result<()> {
        let reputation = &mut ctx.accounts.reputation;
        reputation.agent = ctx.accounts.agent.key();
        reputation.completed_tasks = 0;
        reputation.failed_tasks = 0;
        reputation.total_earned = 0;
        reputation.success_rate = 0;
        reputation.rating_sum = 0;
        reputation.rating_count = 0;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(task_id: String)]
pub struct CreateTask<'info> {
    #[account(
        init,
        payer = poster,
        space = 8 + Task::MAX_SIZE,
        seeds = [b"task", task_id.as_bytes()],
        bump
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        init,
        payer = poster,
        seeds = [b"escrow", task_id.as_bytes()],
        bump,
        token::mint = usdc_mint,
        token::authority = escrow_account,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub poster: Signer<'info>,
    
    #[account(
        mut,
        constraint = poster_token_account.owner == poster.key(),
        constraint = poster_token_account.mint == usdc_mint.key()
    )]
    pub poster_token_account: Account<'info, TokenAccount>,
    
    pub usdc_mint: Account<'info, token::Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BidOnTask<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    
    #[account(
        init,
        payer = bidder,
        space = 8 + Bid::MAX_SIZE,
        seeds = [b"bid", task.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AcceptBid<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    
    #[account(mut)]
    pub bid: Account<'info, Bid>,
    
    pub poster: Signer<'info>,
}

#[derive(Accounts)]
pub struct CompleteTask<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    pub agent: Signer<'info>,
}

#[derive(Accounts)]
pub struct VerifyAndPay<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump = task.escrow_bump,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub agent_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        seeds = [b"reputation", task.assigned_agent.unwrap().as_ref()],
        bump
    )]
    pub agent_reputation: Account<'info, Reputation>,
    
    pub poster: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct InitializeReputation<'info> {
    #[account(
        init,
        payer = agent,
        space = 8 + Reputation::MAX_SIZE,
        seeds = [b"reputation", agent.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, Reputation>,
    
    #[account(mut)]
    pub agent: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct Task {
    pub task_id: String,
    pub poster: Pubkey,
    pub title: String,
    pub description: String,
    pub budget: u64,
    pub final_budget: u64,
    pub deadline: i64,
    pub required_skills: Vec<String>,
    pub status: TaskStatus,
    pub assigned_agent: Option<Pubkey>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub delivery_url: Option<String>,
    pub escrow_bump: u8,
}

impl Task {
    pub const MAX_SIZE: usize = 32 + 32 + 100 + 1000 + 8 + 8 + 8 + 200 + 1 + 33 + 8 + 9 + 100 + 1;
}

#[account]
pub struct Bid {
    pub task: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub estimated_duration: i64,
    pub created_at: i64,
    pub accepted: bool,
}

impl Bid {
    pub const MAX_SIZE: usize = 32 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Reputation {
    pub agent: Pubkey,
    pub completed_tasks: u32,
    pub failed_tasks: u32,
    pub total_earned: u64,
    pub success_rate: u64,
    pub rating_sum: u64,
    pub rating_count: u32,
}

impl Reputation {
    pub const MAX_SIZE: usize = 32 + 4 + 4 + 8 + 8 + 8 + 4;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    Posted,
    InProgress,
    Completed,
    Verified,
    Disputed,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Task is not open for bidding")]
    TaskNotOpen,
    #[msg("Task is not in progress")]
    TaskNotInProgress,
    #[msg("Task is not completed")]
    TaskNotCompleted,
    #[msg("Bid exceeds task budget")]
    BidTooHigh,
    #[msg("Unauthorized action")]
    Unauthorized,
}

#[event]
pub struct TaskCreated {
    pub task_id: String,
    pub poster: Pubkey,
    pub budget: u64,
}

#[event]
pub struct BidPlaced {
    pub task_id: String,
    pub bidder: Pubkey,
    pub amount: u64,
}

#[event]
pub struct BidAccepted {
    pub task_id: String,
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TaskCompleted {
    pub task_id: String,
    pub agent: Pubkey,
}

#[event]
pub struct PaymentReleased {
    pub task_id: String,
    pub agent: Pubkey,
    pub amount: u64,
}
