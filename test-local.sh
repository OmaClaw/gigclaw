#!/bin/bash
# Local Contract Testing Script

set -e

echo "🦞 GigClaw Local Contract Testing"
echo "=================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI not found. Please install from https://docs.solana.com/cli/install"
    exit 1
fi

if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor not found. Please install: npm install -g @coral-xyz/anchor-cli"
    exit 1
fi

echo "✅ Solana CLI: $(solana --version)"
echo "✅ Anchor: $(anchor --version)"
echo ""

# Check if validator is running
echo "🔍 Checking local validator..."
if ! solana cluster-version 2>/dev/null | grep -q "127.0.0.1"; then
    echo "⚠️  Local validator not running. Starting..."
    solana-test-validator --reset &
    VALIDATOR_PID=$!
    sleep 5
    echo "✅ Validator started (PID: $VALIDATOR_PID)"
else
    echo "✅ Local validator already running"
fi
echo ""

# Configure Solana CLI for local
echo "⚙️  Configuring Solana CLI for localnet..."
solana config set --url localhost
solana config set --keypair ~/.config/solana/id.json 2>/dev/null || solana-keygen new --no-passphrase -o ~/.config/solana/id.json
echo "✅ Using keypair: $(solana address)"
echo ""

# Airdrop SOL
echo "💰 Airdropping SOL..."
solana airdrop 10 2>/dev/null || echo "⚠️  Airdrop may have failed, continuing..."
echo "Balance: $(solana balance)"
echo ""

cd contracts

# Build contracts
echo "🔨 Building contracts..."
anchor build
echo "✅ Build complete"
echo ""

# Deploy
echo "🚀 Deploying to localnet..."
anchor deploy --provider.cluster localnet 2>&1 | tee deploy.log
echo "✅ Deployed"
echo ""

# Extract program ID
PROGRAM_ID=$(grep "Program Id:" deploy.log | awk '{print $3}')
echo "📍 Program ID: $PROGRAM_ID"
echo ""

# Run tests
echo "🧪 Running contract tests..."
anchor test --skip-local-validator 2>&1 | tee test.log
echo "✅ Tests complete"
echo ""

# Test summary
echo "📊 Test Summary"
echo "==============="
echo "Program ID: $PROGRAM_ID"
echo "Network: Localnet (127.0.0.1:8899)"
echo ""
echo "✅ Local testing complete!"
echo ""
echo "Next steps:"
echo "  1. Start API server: cd api && npm run dev"
echo "  2. Run agent workers: cd agents && npm run coordinator"
echo "  3. Test end-to-end workflow"
echo ""

# Cleanup
echo "📝 To stop validator: kill $VALIDATOR_PID 2>/dev/null || true"
