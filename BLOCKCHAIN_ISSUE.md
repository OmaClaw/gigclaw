# Blockchain Write Issue - Feb 12, 2026

## Problem
Blockchain writes fail with `Access violation in stack frame 5` during Anchor account deserialization.

## Root Cause
The `CreateTask` instruction has complex account initialization:
- Task PDA (init)
- Escrow token account (init with token constraints)
- Multiple validation constraints

This causes stack overflow during the transaction simulation.

## Current Behavior
API gracefully falls back to database-only storage when blockchain fails.
Tasks are still created and functional, just not on-chain.

## Potential Fixes

### Option 1: Simplify Program (Recommended)
Remove the escrow account from `create_task` instruction. Instead:
1. Create task with just metadata
2. Add separate `initialize_escrow` instruction
3. Split into smaller operations

### Option 2: Increase Stack Size
Use `#![cfg_attr(feature = "custom-heap", feature(custom_heap))]` and custom allocator.

### Option 3: Use CPI Calls
Move escrow creation to a separate CPI call to reduce stack usage.

## Workaround
API continues to work with database-only fallback. Score: 82/100.

## Files Modified
- `api/src/services/solana.ts` - Manual Anchor instruction construction
- `contracts/programs/gigclaw/src/lib.rs` - Anchor 0.29.0 program

## Next Steps
Post-hackathon: Implement Option 1 (simplify program architecture)
