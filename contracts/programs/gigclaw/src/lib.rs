use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

// Security: Add overflow checks
use anchor_lang::solana_program::clock::Clock;

// Constants for validation
const MAX_TITLE_LENGTH: usize = 100;
const MAX_DESCRIPTION_LENGTH: usize = 2000;
const MAX_SKILLS: usize = 10;
const MAX_SKILL_LENGTH: usize = 50;
const MINIMUM_BUDGET: u64 = 1_000_000; // 1 USDC (6 decimals)
const MAX_TASK_DURATION: i64 = 90 * 24 * 60 * 60; // 90 days in seconds

// Reputation thresholds
const REPUTATION_STAKE_RATIO: u64 = 10; // Stake 10% of bid amount as reputation collateral

// Dispute timeout
const DISPUTE_RESOLUTION_TIMEOUT: i64 = 7 * 24 * 60 * 60; // 7 days

declare_id!("4CEy2MLsPL5p9BqG2RsBJWoFGczp2WG5yaHGYv7HbCjg");

#[program]
pub mod gigclaw {
    use super::*;

    /// Create a new task with comprehensive validation (WITHOUT escrow)
    /// Call initialize_escrow separately to fund the task
    /// 
    /// # Arguments
    /// * `task_id` - Unique identifier for the task
    /// * `title` - Task title (max 100 chars)
    /// * `description` - Task description (max 2000 chars)
    /// * `budget` - Task budget in USDC (min 1 USDC)
    /// * `deadline` - Unix timestamp for task deadline (max 90 days)
    /// * `required_skills` - Vector of required skills (max 10, each max 50 chars)
    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        title: String,
        description: String,
        budget: u64,
        deadline: i64,
        required_skills: Vec<String>,
    ) -> Result<()> {
        // Validation: Task ID
        require!(
            !task_id.is_empty() && task_id.len() <= 32,
            ErrorCode::InvalidTaskId
        );

        // Validation: Title
        require!(
            !title.is_empty() && title.len() <= MAX_TITLE_LENGTH,
            ErrorCode::InvalidTitle
        );

        // Validation: Description
        require!(
            description.len() <= MAX_DESCRIPTION_LENGTH,
            ErrorCode::InvalidDescription
        );

        // Validation: Budget (minimum 1 USDC)
        require!(
            budget >= MINIMUM_BUDGET,
            ErrorCode::BudgetTooLow
        );

        // Validation: Deadline (must be in future, max 90 days)
        let current_time = Clock::get()?.unix_timestamp;
        let max_deadline = current_time
            .checked_add(MAX_TASK_DURATION)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        require!(
            deadline > current_time && deadline <= max_deadline,
            ErrorCode::InvalidDeadline
        );

        // Validation: Skills
        require!(
            required_skills.len() <= MAX_SKILLS,
            ErrorCode::TooManySkills
        );
        
        for skill in &required_skills {
            require!(
                !skill.is_empty() && skill.len() <= MAX_SKILL_LENGTH,
                ErrorCode::InvalidSkill
            );
        }

        let task = &mut ctx.accounts.task;
        let poster = &ctx.accounts.poster;

        task.task_id = task_id.clone();
        task.poster = poster.key();
        task.title = title;
        task.description = description;
        task.budget = budget;
        task.final_budget = 0; // Set when bid accepted
        task.deadline = deadline;
        task.required_skills = required_skills;
        task.status = TaskStatus::Posted;
        task.assigned_agent = None;
        task.created_at = current_time;
        task.completed_at = None;
        task.delivery_url = None;
        task.escrow_initialized = false;
        task.escrow_bump = 0;
        task.dispute_reason = None;
        task.dispute_initiator = None;
        task.dispute_created_at = None;

        emit!(TaskCreated {
            task_id: task.task_id.clone(),
            poster: poster.key(),
            budget,
            deadline,
        });

        Ok(())
    }

    /// Initialize escrow account and transfer funds
    /// Must be called after create_task and before bidding
    pub fn initialize_escrow(ctx: Context<InitializeEscrow>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let poster = &ctx.accounts.poster;

        // Validation: Only poster can initialize escrow
        require!(
            task.poster == poster.key(),
            ErrorCode::UnauthorizedPoster
        );

        // Validation: Escrow not already initialized
        require!(
            !task.escrow_initialized,
            ErrorCode::EscrowAlreadyInitialized
        );

        // Validation: Task is still in Posted status
        require!(
            task.status == TaskStatus::Posted,
            ErrorCode::TaskNotOpen
        );

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

        token::transfer(cpi_ctx, task.budget)?;

        // Mark escrow as initialized
        task.escrow_initialized = true;
        task.escrow_bump = ctx.bumps.escrow_account;

        emit!(EscrowInitialized {
            task_id: task.task_id.clone(),
            escrow: ctx.accounts.escrow_account.key(),
            amount: task.budget,
        });

        Ok(())
    }

    /// Bid on a task with reputation staking
    pub fn bid_on_task(
        ctx: Context<BidOnTask>,
        bid_amount: u64,
        estimated_duration: i64,
    ) -> Result<()> {
        let task = &ctx.accounts.task;
        let bidder = &ctx.accounts.bidder;
        let current_time = Clock::get()?.unix_timestamp;

        // Validation: Task must be open
        require!(
            task.status == TaskStatus::Posted,
            ErrorCode::TaskNotOpen
        );

        // Validation: Escrow must be initialized
        require!(
            task.escrow_initialized,
            ErrorCode::EscrowNotInitialized
        );

        // Validation: Task must not be expired
        require!(
            current_time < task.deadline,
            ErrorCode::TaskExpired
        );

        // Validation: Bid amount
        require!(
            bid_amount > 0 && bid_amount <= task.budget,
            ErrorCode::InvalidBidAmount
        );

        // Validation: Poster cannot bid on their own task
        require!(
            bidder.key() != task.poster,
            ErrorCode::PosterCannotBid
        );

        // Validation: Estimated duration must be reasonable
        require!(
            estimated_duration > 0 && estimated_duration <= MAX_TASK_DURATION,
            ErrorCode::InvalidDuration
        );

        // Check if bidder has sufficient reputation stake
        let reputation = &ctx.accounts.bidder_reputation;
        let min_reputation = bid_amount
            .checked_div(REPUTATION_STAKE_RATIO)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        require!(
            reputation.completed_tasks >= 1 || reputation.total_earned >= min_reputation,
            ErrorCode::InsufficientReputation
        );

        let bid = &mut ctx.accounts.bid;
        bid.task = task.key();
        bid.bidder = bidder.key();
        bid.amount = bid_amount;
        bid.estimated_duration = estimated_duration;
        bid.created_at = current_time;
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
        let current_time = Clock::get()?.unix_timestamp;

        // Validation: Task must be open
        require!(
            task.status == TaskStatus::Posted,
            ErrorCode::TaskNotOpen
        );

        // Validation: Task must not be expired
        require!(
            current_time < task.deadline,
            ErrorCode::TaskExpired
        );

        // Validation: Only poster can accept bids
        require!(
            task.poster == ctx.accounts.poster.key(),
            ErrorCode::UnauthorizedPoster
        );

        // Validation: Bid must belong to this task
        require!(
            bid.task == task.key(),
            ErrorCode::InvalidBid
        );

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

    /// Cancel a task (only by poster, only if no bid accepted)
    pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        // Validation: Only poster can cancel
        require!(
            task.poster == ctx.accounts.poster.key(),
            ErrorCode::UnauthorizedPoster
        );

        // Validation: Can only cancel if no bid accepted
        require!(
            task.status == TaskStatus::Posted,
            ErrorCode::TaskNotCancellable
        );

        // Only refund if escrow was initialized
        if task.escrow_initialized {
            // Refund escrow to poster
            let transfer_instruction = Transfer {
                from: ctx.accounts.escrow_account.to_account_info(),
                to: ctx.accounts.poster_token_account.to_account_info(),
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

            token::transfer(cpi_ctx, task.budget)?;
        }

        task.status = TaskStatus::Cancelled;

        emit!(TaskCancelled {
            task_id: task.task_id.clone(),
            poster: task.poster,
            refund_amount: if task.escrow_initialized { task.budget } else { 0 },
        });

        Ok(())
    }

    /// Mark task as completed by assigned agent
    pub fn complete_task(ctx: Context<CompleteTask>, delivery_url: String) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let current_time = Clock::get()?.unix_timestamp;
        
        // Validation: Task must be in progress
        require!(
            task.status == TaskStatus::InProgress,
            ErrorCode::TaskNotInProgress
        );

        // Validation: Only assigned agent can complete
        require!(
            task.assigned_agent == Some(ctx.accounts.agent.key()),
            ErrorCode::UnauthorizedAgent
        );

        // Validation: Delivery URL format
        require!(
            !delivery_url.is_empty() && delivery_url.len() <= 200,
            ErrorCode::InvalidDeliveryUrl
        );

        task.status = TaskStatus::Completed;
        task.delivery_url = Some(delivery_url);
        task.completed_at = Some(current_time);

        emit!(TaskCompleted {
            task_id: task.task_id.clone(),
            agent: ctx.accounts.agent.key(),
        });

        Ok(())
    }

    /// Verify work and release payment
    pub fn verify_and_pay(ctx: Context<VerifyAndPay>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        // Validation: Task must be completed
        require!(
            task.status == TaskStatus::Completed,
            ErrorCode::TaskNotCompleted
        );

        // Validation: Only poster can verify
        require!(
            task.poster == ctx.accounts.poster.key(),
            ErrorCode::UnauthorizedPoster
        );

        // Transfer payment from escrow to agent
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

        // Update agent reputation
        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.completed_tasks = reputation.completed_tasks
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        reputation.total_earned = reputation.total_earned
            .checked_add(task.final_budget)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        let total_tasks = reputation.completed_tasks
            .checked_add(reputation.failed_tasks)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .max(1);
        
        reputation.success_rate = (reputation.completed_tasks as u64)
            .checked_mul(100)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(total_tasks as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        task.status = TaskStatus::Verified;

        emit!(PaymentReleased {
            task_id: task.task_id.clone(),
            agent: task.assigned_agent.unwrap(),
            amount: task.final_budget,
        });

        Ok(())
    }

    /// Rate an agent after task completion
    pub fn rate_agent(ctx: Context<RateAgent>, rating: u8) -> Result<()> {
        let task = &ctx.accounts.task;
        
        // Validation: Task must be verified
        require!(
            task.status == TaskStatus::Verified,
            ErrorCode::TaskNotVerified
        );

        // Validation: Only poster can rate
        require!(
            task.poster == ctx.accounts.poster.key(),
            ErrorCode::UnauthorizedPoster
        );

        // Validation: Rating must be 1-5
        require!(
            rating >= 1 && rating <= 5,
            ErrorCode::InvalidRating
        );

        let reputation = &mut ctx.accounts.agent_reputation;
        
        reputation.rating_sum = reputation.rating_sum
            .checked_add(rating as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        reputation.rating_count = reputation.rating_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        emit!(AgentRated {
            task_id: task.task_id.clone(),
            agent: task.assigned_agent.unwrap(),
            rating,
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

        emit!(ReputationInitialized {
            agent: ctx.accounts.agent.key(),
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

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
    
    #[account(mut)]
    pub poster: Signer<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeEscrow<'info> {
    #[account(
        mut,
        has_one = poster,
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        init,
        payer = poster,
        seeds = [b"escrow", task.task_id.as_bytes()],
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
    
    #[account(
        seeds = [b"reputation", bidder.key().as_ref()],
        bump
    )]
    pub bidder_reputation: Account<'info, Reputation>,
    
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
pub struct CancelTask<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"escrow", task.task_id.as_bytes()],
        bump = task.escrow_bump,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub poster_token_account: Account<'info, TokenAccount>,
    
    pub poster: Signer<'info>,
    pub token_program: Program<'info, Token>,
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
pub struct RateAgent<'info> {
    #[account(mut)]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"reputation", task.assigned_agent.unwrap().as_ref()],
        bump
    )]
    pub agent_reputation: Account<'info, Reputation>,
    
    pub poster: Signer<'info>,
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

// ============================================================================
// DATA STRUCTURES
// ============================================================================

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
    pub escrow_initialized: bool,
    pub escrow_bump: u8,
    // Dispute fields
    pub dispute_reason: Option<String>,
    pub dispute_initiator: Option<Pubkey>,
    pub dispute_created_at: Option<i64>,
}

impl Task {
    // Calculate max size for account allocation
    pub const MAX_SIZE: usize = 
        4 + 32 +    // task_id (String: 4 bytes len + 32 bytes max)
        32 +        // poster (Pubkey)
        4 + 100 +   // title (String: 4 + 100)
        4 + 2000 +  // description (String: 4 + 2000)
        8 +         // budget (u64)
        8 +         // final_budget (u64)
        8 +         // deadline (i64)
        4 + (10 * (4 + 50)) + // required_skills (Vec: 4 + 10*(4+50))
        1 +         // status (TaskStatus enum)
        1 + 32 +    // assigned_agent (Option<Pubkey>: 1 + 32)
        8 +         // created_at (i64)
        1 + 8 +     // completed_at (Option<i64>: 1 + 8)
        1 + 4 + 200 + // delivery_url (Option<String>: 1 + 4 + 200)
        1 +         // escrow_initialized (bool)
        1 +         // escrow_bump (u8)
        1 + 4 + 500 + // dispute_reason (Option<String>: 1 + 4 + 500)
        1 + 32 +    // dispute_initiator (Option<Pubkey>: 1 + 32)
        1 + 8;      // dispute_created_at (Option<i64>: 1 + 8)
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
    pub const MAX_SIZE: usize = 
        32 +    // task (Pubkey)
        32 +    // bidder (Pubkey)
        8 +     // amount (u64)
        8 +     // estimated_duration (i64)
        8 +     // created_at (i64)
        1;      // accepted (bool)
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
    pub const MAX_SIZE: usize = 
        32 +    // agent (Pubkey)
        4 +     // completed_tasks (u32)
        4 +     // failed_tasks (u32)
        8 +     // total_earned (u64)
        8 +     // success_rate (u64)
        8 +     // rating_sum (u64)
        4;      // rating_count (u32)
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    Posted,      // Task created, accepting bids
    InProgress,  // Bid accepted, work in progress
    Completed,   // Agent marked as complete, awaiting verification
    Verified,    // Payment released, task complete
    Disputed,    // Dispute raised, awaiting resolution
    Cancelled,   // Task cancelled by poster
}

// ============================================================================
// ERROR CODES
// ============================================================================

#[error_code]
pub enum ErrorCode {
    // Task creation errors
    #[msg("Invalid task ID: must be 1-32 characters")]
    InvalidTaskId,
    #[msg("Invalid title: must be 1-100 characters")]
    InvalidTitle,
    #[msg("Invalid description: must be 0-2000 characters")]
    InvalidDescription,
    #[msg("Budget too low: minimum 1 USDC (1,000,000 micro-USDC)")]
    BudgetTooLow,
    #[msg("Invalid deadline: must be in the future and within 90 days")]
    InvalidDeadline,
    #[msg("Too many skills: maximum 10 skills allowed")]
    TooManySkills,
    #[msg("Invalid skill: must be 1-50 characters")]
    InvalidSkill,
    
    // Escrow errors
    #[msg("Escrow already initialized")]
    EscrowAlreadyInitialized,
    #[msg("Escrow not initialized")]
    EscrowNotInitialized,
    
    // Bidding errors
    #[msg("Task is not open for bidding")]
    TaskNotOpen,
    #[msg("Task has expired")]
    TaskExpired,
    #[msg("Invalid bid amount: must be greater than 0 and not exceed budget")]
    InvalidBidAmount,
    #[msg("Poster cannot bid on their own task")]
    PosterCannotBid,
    #[msg("Invalid duration: must be positive and within 90 days")]
    InvalidDuration,
    #[msg("Insufficient reputation: complete a task or earn reputation first")]
    InsufficientReputation,
    
    // Task status errors
    #[msg("Task is not in progress")]
    TaskNotInProgress,
    #[msg("Task is not completed")]
    TaskNotCompleted,
    #[msg("Task is not verified")]
    TaskNotVerified,
    #[msg("Task cannot be cancelled: must be in Posted status")]
    TaskNotCancellable,
    
    // Authorization errors
    #[msg("Unauthorized: only poster can perform this action")]
    UnauthorizedPoster,
    #[msg("Unauthorized: only assigned agent can perform this action")]
    UnauthorizedAgent,
    #[msg("Invalid bid: bid does not belong to this task")]
    InvalidBid,
    
    // Delivery errors
    #[msg("Invalid delivery URL: must be 1-200 characters")]
    InvalidDeliveryUrl,
    
    // Rating errors
    #[msg("Invalid rating: must be 1-5")]
    InvalidRating,
    
    // Arithmetic errors
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct TaskCreated {
    pub task_id: String,
    pub poster: Pubkey,
    pub budget: u64,
    pub deadline: i64,
}

#[event]
pub struct EscrowInitialized {
    pub task_id: String,
    pub escrow: Pubkey,
    pub amount: u64,
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
pub struct TaskCancelled {
    pub task_id: String,
    pub poster: Pubkey,
    pub refund_amount: u64,
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

#[event]
pub struct AgentRated {
    pub task_id: String,
    pub agent: Pubkey,
    pub rating: u8,
}

#[event]
pub struct ReputationInitialized {
    pub agent: Pubkey,
}
