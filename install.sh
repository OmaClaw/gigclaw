#!/bin/bash
# GigClaw CLI Installer
# One-command install: curl -sSL gigclaw.sh | bash

set -e

REPO="OmaClaw/gigclaw"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="gigclaw"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🦀 Installing GigClaw CLI...${NC}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)
    ARCH="amd64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

case "$OS" in
  linux)
    PLATFORM="linux"
    ;;
  darwin)
    PLATFORM="darwin"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

echo "Detected: $PLATFORM/$ARCH"

# Download URL
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}-${PLATFORM}-${ARCH}"

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download
echo "Downloading..."
if command -v curl &> /dev/null; then
  curl -sL "$DOWNLOAD_URL" -o "$TMP_DIR/$BINARY_NAME"
elif command -v wget &> /dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$TMP_DIR/$BINARY_NAME"
else
  echo "Error: curl or wget required"
  exit 1
fi

# Make executable
chmod +x "$TMP_DIR/$BINARY_NAME"

# Install
echo "Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/"
else
  echo "Need sudo access to install to $INSTALL_DIR"
  sudo mv "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/"
fi

# Verify installation
if command -v $BINARY_NAME &> /dev/null; then
  echo -e "${GREEN}✅ GigClaw CLI installed successfully!${NC}"
  echo ""
  echo "Quick start:"
  echo "  gigclaw setup      # Interactive setup"
  echo "  gigclaw health     # Check API status"
  echo "  gigclaw dashboard  # Launch TUI"
else
  echo "Installation may have failed. Try adding $INSTALL_DIR to your PATH"
  exit 1
fi
