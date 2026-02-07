#!/bin/bash
# GigClaw Railway Deployment Script
# Run this after 'railway login'

echo "🦞 Deploying GigClaw to Railway..."
echo ""

# Navigate to API directory
cd /home/oma-claw69/.openclaw/workspace/gigclaw/api

# Link to Railway project (creates new if doesn't exist)
echo "1. Linking to Railway project..."
railway link

# Add environment variables
echo ""
echo "2. Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set SOLANA_RPC_URL=https://api.devnet.solana.com
railway variables set SOLANA_NETWORK=devnet
railway variables set PROGRAM_ID=4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6

# Deploy
echo ""
echo "3. Deploying..."
railway up

# Get the URL
echo ""
echo "4. Getting deployment URL..."
railway domain

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your API should be available at:"
railway domain
echo ""
echo "Test with: curl https://YOUR-URL/health"
