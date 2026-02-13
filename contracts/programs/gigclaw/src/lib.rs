//! GigClaw - Agent-Native Task Marketplace
//! 
//! A Solana program for autonomous AI agent task coordination with:
//! - USDC escrow for secure payments
//! - Reputation system with on-chain tracking
//! - Multi-agent bidding and assignment
//! - Dispute resolution
//!
//! Architecture: Split instructions to avoid stack overflow

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

// ============================================================================
// CONSTANTS
// ============================================================================

/// Task metadata limits
pub const MAX_TITLE_LENGTH: usize = 100;
pub const MAX_DESCRIPTION_LENGTH: usize = 2000;
pub const MAX_SKILLS: usize = 10;
pub const MAX_SKILL_LENGTH: usize = 50;
pub const MAX_TASK_ID_LENGTH: usize = 32;

/// Financial constants
pub const MINIMUM_BUDGET: u64 = 1_000_000; // 1 USDC (6 decimals)
pub const REPUTATION_STAKE_RATIO: u64 = 10; // 10% of bid as reputation collateral

/// Time constants (in seconds)
pub const MAX_TASK_DURATION: i64 = 90 * 24 * 60 * 60; // 90 days
pub const DISPUTE_RESOLUTION_TIMEOUT: i64 = 7 * 24 * 60 * 60; // 7 days

// ============================================================================
// PROGRAM ID
// ============================================================================

declare_id!("9bV8oV5f7eaQw6iRdePgaX8jTmCnMAAt4gePqivZ6v91");

// ============================================================================
// PROGRAM MODULE
// ============================================================================

#[program]
pub mod gigclaw {
    use super::*;

    // ========================================================================
    // TASK MANAGEMENT
    // ========================================================================

    /// Creates a new task posting (metadata only, no escrow)
    /// 
    /// # Instruction Accounts (Stack-Optimized)
    /// - task: New task account (init)
    /// - poster: Signer paying for task creation
    /// - system_program: For account allocation
    /// - rent: Rent sysvar
    ///
    /// # Args
    /// - task_id: Unique task identifier (1-32 chars)
    /// - title: Task title (1-100 chars)
    /// - description: Task details (0-2000 chars)
    /// - budget: USDC amount (min 1 USDC)
    /// - deadline: Unix timestamp (future, max 90 days)
    /// - required_skills: Array of skill tags (max 10, each max 50 chars)
    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        title: String,
        description: String,
        budget: u64,
        deadline: i64,
        required_skills: Vec<String>,
    ) -> Result<()> {
        // Validate all inputs first (fail fast)
        validate_task_inputs(&task_id, &title, &description, budget, deadline, &required_skills)?;

        let task = &mut ctx.accounts.task;
        let poster = &ctx.accounts.poster;
        let clock = Clock::get()?;

        // Initialize task state
        task.init(
            task_id.clone(),
            poster.key(),
            title,
            description,
            budget,
            deadline,
            required_skills,
            clock.unix_timestamp,
        )?;

        emit!(TaskCreated {
            task_id,
            poster: poster.key(),
            budget,
            deadline,
        });

        Ok(())
    }

    /// Initializes escrow and transfers USDC (separate instruction for stack safety)
    ///
    /// Must be called AFTER create_task and BEFORE bidding starts
    pub fn initialize_escrow(ctx: Context<InitializeEscrow>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let poster = &ctx.accounts.poster;

        // Verify authorization
        require!(task.poster == poster.key(), ErrorCode::UnauthorizedPoster);
        require!(!task.escrow_initialized, ErrorCode::EscrowAlreadyInitialized);
        require!(task.status == TaskStatus::Posted, ErrorCode::TaskNotOpen);

        // Execute token transfer
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.poster_token_account.to_account_info(),
                to: ctx.accounts.escrow_account.to_account_info(),
                authority: poster.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, task.budget)?;

        // Update task state
        task.escrow_initialized = true;
        task.escrow_bump = ctx.bumps.escrow_account;

        emit!(EscrowInitialized {
            task_id: task.task_id.clone(),
            escrow: ctx.accounts.escrow_account.key(),
            amount: task.budget,
        });

        Ok(())
    }

    /// Cancels a task and refunds escrow (if initialized)
    pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        
        require!(task.poster == ctx.accounts.poster.key(), ErrorCode::UnauthorizedPoster);
        require!(task.status == TaskStatus::Posted, ErrorCode::TaskNotCancellable);

        // Refund escrow if it was initialized
        if task.escrow_initialized {
            let seeds = &[
                b"escrow",
                task.task_id.as_bytes(),
                &[task.escrow_bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_account.to_account_info(),
                    to: ctx.accounts.poster_token_account.to_account_info(),
                    authority: ctx.accounts.escrow_account.to_account_info(),
                },
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

    // ========================================================================
    // BIDDING SYSTEM
    // ========================================================================

    /// Places a bid on a task with reputation check
    pub fn bid_on_task(
        ctx: Context<BidOnTask>,
        bid_amount: u64,
        estimated_duration: i64,
    ) -> Result<()> {
        let task = &ctx.accounts.task;
        let bidder = &ctx.accounts.bidder;
        let clock = Clock::get()?;

        // Validate task state
        require!(task.status == TaskStatus::Posted, ErrorCode::TaskNotOpen);
        require!(task.escrow_initialized, ErrorCode::EscrowNotInitialized);
        require!(clock.unix_timestamp < task.deadline, ErrorCode::TaskExpired);
        
        // Validate bid
        require!(bid_amount > 0 && bid_amount <= task.budget, ErrorCode::InvalidBidAmount);
        require!(bidder.key() != task.poster, ErrorCode::PosterCannotBid);
        require!(
            estimated_duration > 0 && estimated_duration <= MAX_TASK_DURATION,
            ErrorCode::InvalidDuration
        );

        // Check reputation
        let reputation = &ctx.accounts.bidder_reputation;
        let min_reputation = bid_amount
            .checked_div(REPUTATION_STAKE_RATIO)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        require!(
            reputation.completed_tasks >= 1 || reputation.total_earned >= min_reputation,
            ErrorCode::InsufficientReputation
        );

        // Create bid
        ctx.accounts.bid.init(
            task.key(),
            bidder.key(),
            bid_amount,
            estimated_duration,
            clock.unix_timestamp,
        )?;

        emit!(BidPlaced {
            task_id: task.task_id.clone(),
            bidder: bidder.key(),
            amount: bid_amount,
        });

        Ok(())
    }

    /// Accepts a bid and assigns agent to task
    pub fn accept_bid(ctx: Context<AcceptBid>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let bid = &ctx.accounts.bid;
        let clock = Clock::get()?;

        require!(task.status == TaskStatus::Posted, ErrorCode::TaskNotOpen);
        require!(clock.unix_timestamp < task.deadline, ErrorCode::TaskExpired);
        require!(task.poster == ctx.accounts.poster.key(), ErrorCode::UnauthorizedPoster);
        require!(bid.task == task.key(), ErrorCode::InvalidBid);

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

    // ========================================================================
    // TASK COMPLETION & PAYMENT
    // ========================================================================

    /// Marks task as completed by assigned agent
    pub fn complete_task(ctx: Context<CompleteTask>, delivery_url: String) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let clock = Clock::get()?;

        require!(task.status == TaskStatus::InProgress, ErrorCode::TaskNotInProgress);
        require!(task.assigned_agent == Some(ctx.accounts.agent.key()), ErrorCode::UnauthorizedAgent);
        require!(!delivery_url.is_empty() && delivery_url.len() <= 200, ErrorCode::InvalidDeliveryUrl);

        task.status = TaskStatus::Completed;
        task.delivery_url = Some(delivery_url);
        task.completed_at = Some(clock.unix_timestamp);

        emit!(TaskCompleted {
            task_id: task.task_id.clone(),
            agent: ctx.accounts.agent.key(),
        });

        Ok(())
    }

    /// Verifies completion and releases payment to agent
    pub fn verify_and_pay(ctx: Context<VerifyAndPay>) -> Result<()> {
        let task = &mut ctx.accounts.task;

        require!(task.status == TaskStatus::Completed, ErrorCode::TaskNotCompleted);
        require!(task.poster == ctx.accounts.poster.key(), ErrorCode::UnauthorizedPoster);

        // Transfer payment from escrow to agent
        let seeds = &[
            b"escrow",
            task.task_id.as_bytes(),
            &[task.escrow_bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_account.to_account_info(),
                to: ctx.accounts.agent_token_account.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, task.final_budget)?;

        // Update agent reputation
        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.record_completion(task.final_budget)?;

        task.status = TaskStatus::Verified;

        emit!(PaymentReleased {
            task_id: task.task_id.clone(),
            agent: task.assigned_agent.unwrap(),
            amount: task.final_budget,
        });

        Ok(())
    }

    // ========================================================================
    // REPUTATION SYSTEM
    // ========================================================================

    /// Initializes a reputation account for an agent
    pub fn initialize_reputation(ctx: Context<InitializeReputation>) -> Result<()> {
        ctx.accounts.reputation.init(ctx.accounts.agent.key())?;

        emit!(ReputationInitialized {
            agent: ctx.accounts.agent.key(),
        });

        Ok(())
    }

    /// Rates an agent after task completion
    pub fn rate_agent(ctx: Context<RateAgent>, rating: u8) -> Result<()> {
        let task = &ctx.accounts.task;

        require!(task.status == TaskStatus::Verified, ErrorCode::TaskNotVerified);
        require!(task.poster == ctx.accounts.poster.key(), ErrorCode::UnauthorizedPoster);
        require!(rating >= 1 && rating <= 5, ErrorCode::InvalidRating);

        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.add_rating(rating)?;

        emit!(AgentRated {
            task_id: task.task_id.clone(),
            agent: task.assigned_agent.unwrap(),
            rating,
        });

        Ok(())
    }
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

fn validate_task_inputs(
    task_id: &str,
    title: &str,
    description: &str,
    budget: u64,
    deadline: i64,
    required_skills: &[String],
) -> Result<()> {
    // Task ID validation
    require!(!task_id.is_empty(), ErrorCode::InvalidTaskId);
    require!(task_id.len() <= MAX_TASK_ID_LENGTH, ErrorCode::InvalidTaskId);

    // Title validation
    require!(!title.is_empty(), ErrorCode::InvalidTitle);
    require!(title.len() <= MAX_TITLE_LENGTH, ErrorCode::InvalidTitle);

    // Description validation
    require!(description.len() <= MAX_DESCRIPTION_LENGTH, ErrorCode::InvalidDescription);

    // Budget validation
    require!(budget >= MINIMUM_BUDGET, ErrorCode::BudgetTooLow);

    // Deadline validation
    let current_time = Clock::get()?.unix_timestamp;
    let max_deadline = current_time
        .checked_add(MAX_TASK_DURATION)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    
    require!(deadline > current_time, ErrorCode::InvalidDeadline);
    require!(deadline <= max_deadline, ErrorCode::InvalidDeadline);

    // Skills validation
    require!(required_skills.len() <= MAX_SKILLS, ErrorCode::TooManySkills);
    
    for skill in required_skills {
        require!(!skill.is_empty(), ErrorCode::InvalidSkill);
        require!(skill.len() <= MAX_SKILL_LENGTH, ErrorCode::InvalidSkill);
    }

    Ok(())
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
    pub dispute_reason: Option<String>,
    pub dispute_initiator: Option<Pubkey>,
    pub dispute_created_at: Option<i64>,
}

impl Task {
    pub const MAX_SIZE: usize = 
        4 + MAX_TASK_ID_LENGTH +           // task_id
        32 +                                // poster
        4 + MAX_TITLE_LENGTH +              // title
        4 + MAX_DESCRIPTION_LENGTH +        // description
        8 +                                 // budget
        8 +                                 // final_budget
        8 +                                 // deadline
        4 + (MAX_SKILLS * (4 + MAX_SKILL_LENGTH)) + // skills
        1 +                                 // status
        1 + 32 +                            // assigned_agent (Option)
        8 +                                 // created_at
        1 + 8 +                             // completed_at (Option)
        1 + 4 + 200 +                       // delivery_url (Option)
        1 +                                 // escrow_initialized
        1 +                                 // escrow_bump
        1 + 4 + 500 +                       // dispute_reason (Option)
        1 + 32 +                            // dispute_initiator (Option)
        1 + 8;                              // dispute_created_at (Option)

    pub fn init(
        &mut self,
        task_id: String,
        poster: Pubkey,
        title: String,
        description: String,
        budget: u64,
        deadline: i64,
        required_skills: Vec<String>,
        created_at: i64,
    ) -> Result<()> {
        self.task_id = task_id;
        self.poster = poster;
        self.title = title;
        self.description = description;
        self.budget = budget;
        self.final_budget = 0;
        self.deadline = deadline;
        self.required_skills = required_skills;
        self.status = TaskStatus::Posted;
        self.assigned_agent = None;
        self.created_at = created_at;
        self.completed_at = None;
        self.delivery_url = None;
        self.escrow_initialized = false;
        self.escrow_bump = 0;
        self.dispute_reason = None;
        self.dispute_initiator = None;
        self.dispute_created_at = None;
        Ok(())
    }
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
        32 +    // task
        32 +    // bidder
        8 +     // amount
        8 +     // estimated_duration
        8 +     // created_at
        1;      // accepted

    pub fn init(
        &mut self,
        task: Pubkey,
        bidder: Pubkey,
        amount: u64,
        estimated_duration: i64,
        created_at: i64,
    ) -> Result<()> {
        self.task = task;
        self.bidder = bidder;
        self.amount = amount;
        self.estimated_duration = estimated_duration;
        self.created_at = created_at;
        self.accepted = false;
        Ok(())
    }
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
        32 +    // agent
        4 +     // completed_tasks
        4 +     // failed_tasks
        8 +     // total_earned
        8 +     // success_rate
        8 +     // rating_sum
        4;      // rating_count

    pub fn init(&mut self, agent: Pubkey) -> Result<()> {
        self.agent = agent;
        self.completed_tasks = 0;
        self.failed_tasks = 0;
        self.total_earned = 0;
        self.success_rate = 0;
        self.rating_sum = 0;
        self.rating_count = 0;
        Ok(())
    }

    pub fn record_completion(&mut self, amount: u64) -> Result<()> {
        self.completed_tasks = self.completed_tasks
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        self.total_earned = self.total_earned
            .checked_add(amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        let total = self.completed_tasks
            .checked_add(self.failed_tasks)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .max(1);
        
        self.success_rate = (self.completed_tasks as u64)
            .checked_mul(100)
            .ok_or(ErrorCode::ArithmeticOverflow)?
            .checked_div(total as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn add_rating(&mut self, rating: u8) -> Result<()> {
        self.rating_sum = self.rating_sum
            .checked_add(rating as u64)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
        
        self.rating_count = self.rating_count
            .checked_add(1)
            .ok_or(ErrorCode::ArithmeticOverflow)?;

        Ok(())
    }
}

// ============================================================================
// ENUMS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    Posted,
    InProgress,
    Completed,
    Verified,
    Disputed,
    Cancelled,
}

// ============================================================================
// ERROR CODES
// ============================================================================

#[error_code]
pub enum ErrorCode {
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
    
    // Escrow
    #[msg("Escrow already initialized")]
    EscrowAlreadyInitialized,
    #[msg("Escrow not initialized")]
    EscrowNotInitialized,
    
    // Bidding
    #[msg("Task is not open for bidding")]
    TaskNotOpen,
    #[msg("Task has expired")]
    TaskExpired,
    #[msg("Invalid bid amount")]
    InvalidBidAmount,
    #[msg("Poster cannot bid on their own task")]
    PosterCannotBid,
    #[msg("Invalid duration estimate")]
    InvalidDuration,
    #[msg("Insufficient reputation")]
    InsufficientReputation,
    
    // Task state
    #[msg("Task is not in progress")]
    TaskNotInProgress,
    #[msg("Task is not completed")]
    TaskNotCompleted,
    #[msg("Task is not verified")]
    TaskNotVerified,
    #[msg("Task cannot be cancelled")]
    TaskNotCancellable,
    
    // Auth
    #[msg("Unauthorized: only poster can perform this action")]
    UnauthorizedPoster,
    #[msg("Unauthorized: only assigned agent can perform this action")]
    UnauthorizedAgent,
    #[msg("Invalid bid")]
    InvalidBid,
    
    // Delivery
    #[msg("Invalid delivery URL")]
    InvalidDeliveryUrl,
    
    // Rating
    #[msg("Invalid rating: must be 1-5")]
    InvalidRating,
    
    // Math
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
