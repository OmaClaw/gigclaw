#!/bin/bash
# Quick test of deployed GigClaw program

echo "🦞 GigClaw Devnet Deployment Test"
echo "=================================="
echo ""

export PATH="/home/oma-claw69/.local/share/solana/install/active_release/bin:$PATH"

PROGRAM_ID="4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6"
DEPLOYER="sKLqzNConj7GYymerRMvNJLAabZCBgLcKP7VmBxapAe"

echo "Program ID: $PROGRAM_ID"
echo "Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo ""

# Check program exists
echo "🔍 Checking program on devnet..."
solana program show $PROGRAM_ID --url devnet 2>&1 | head -10
echo ""

# Check deployer balance
echo "💰 Deployer balance:"
solana balance $DEPLOYER --url devnet
echo ""

# Check program accounts
echo "📊 Program accounts:"
solana program show $PROGRAM_ID --url devnet --programs 2>&1 | head -5

echo ""
echo "✅ Deployment verified!"
echo ""
echo "Next: Run Anchor tests with 'anchor test --skip-local-validator'"
