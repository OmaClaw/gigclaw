# GigClaw Solana Toolchain Setup

This document describes the correct toolchain setup for building GigClaw Solana programs.

## Required Tools

### 1. Solana CLI
```bash
# Download from GitHub releases
curl -L -o /tmp/solana-release.tar.bz2 \
  "https://github.com/solana-labs/solana/releases/download/v1.18.26/solana-release-x86_64-unknown-linux-gnu.tar.bz2"

# Extract
cd /tmp
tar -xjf solana-release.tar.bz2

# Install
mkdir -p ~/.local/bin
cp solana-release/bin/solana ~/.local/bin/
cp solana-release/bin/cargo-build-bpf ~/.cargo/bin/
ln -sf ~/.cargo/bin/cargo-build-bpf ~/.cargo/bin/cargo-build-sbf

# Add to PATH
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
```

### 2. Anchor CLI via AVM
```bash
# Install avm (Anchor Version Manager)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Install anchor 0.31.0
avm install 0.31.0 --force
avm use 0.31.0
```

### 3. Rust
Already installed via system package manager:
```bash
cargo --version  # Should show 1.92.0 or later
```

## Verification

```bash
# Check versions
solana --version      # solana-cli 1.18.26
anchor --version      # anchor-cli 0.31.0
cargo --version       # cargo 1.92.0

# Build the program
cd contracts
anchor build

# Run tests
anchor test
```

## Environment Setup

Add to `~/.bashrc` or `~/.zshrc`:
```bash
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
```

## Troubleshooting

### Error: "no such command: build-sbf"
- The `cargo-build-sbf` tool is installed as `cargo-build-bpf` in older Solana releases
- Solution: Create a symlink: `ln -s cargo-build-bpf cargo-build-sbf`

### Error: "Anchor version not set"
- Run: `avm use 0.31.0`

### Error: Version mismatch warnings
- These are warnings, not errors
- The build still works with version 0.31.0 CLI and 0.29.0 program dependencies

## Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Get devnet SOL
solana airdrop 2

# Deploy
anchor deploy
```

## Program ID

- Devnet: `4pxwKVcQzrQ5Ag5R3eadmcT8bMCXbyVyxb5D6zAEL6K6`
- Localnet: Same (set in Anchor.toml)

---

**Last Updated:** February 7, 2026
