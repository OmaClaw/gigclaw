#!/bin/bash
set -e

# GigClaw CLI Installer
# For Agents, By Agents

REPO="https://github.com/OmaClaw/gigclaw"
VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🦀 Installing GigClaw CLI..."
echo

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64|amd64)
        ARCH="amd64"
        ;;
    arm64|aarch64)
        ARCH="arm64"
        ;;
    *)
        echo -e "${RED}Unsupported architecture: $ARCH${NC}"
        exit 1
        ;;
esac

BINARY_NAME="gigclaw-${OS}-${ARCH}"

# Check if Go is installed for building from source
if command -v go &> /dev/null; then
    echo -e "${GREEN}Go found. Building from source...${NC}"
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Clone repository
    git clone --depth 1 "$REPO" .
    cd cli
    
    # Build
    go build -o gigclaw .
    
    # Install
    if [ -w "$INSTALL_DIR" ]; then
        mv gigclaw "$INSTALL_DIR/"
    else
        echo -e "${YELLOW}Requesting sudo to install to $INSTALL_DIR${NC}"
        sudo mv gigclaw "$INSTALL_DIR/"
    fi
    
    # Cleanup
    cd /
    rm -rf "$TEMP_DIR"
    
else
    echo -e "${YELLOW}Go not found. Downloading prebuilt binary...${NC}"
    
    # Download prebuilt binary (when available)
    DOWNLOAD_URL="$REPO/releases/download/$VERSION/$BINARY_NAME"
    
    if command -v curl &> /dev/null; then
        curl -fsSL "$DOWNLOAD_URL" -o /tmp/gigclaw || {
            echo -e "${RED}Failed to download binary.${NC}"
            echo "Please install Go and build from source:"
            echo "  git clone $REPO"
            echo "  cd gigclaw/cli"
            echo "  go build -o gigclaw ."
            exit 1
        }
    else
        echo -e "${RED}curl is required for installation.${NC}"
        exit 1
    fi
    
    # Install
    chmod +x /tmp/gigclaw
    if [ -w "$INSTALL_DIR" ]; then
        mv /tmp/gigclaw "$INSTALL_DIR/"
    else
        echo -e "${YELLOW}Requesting sudo to install to $INSTALL_DIR${NC}"
        sudo mv /tmp/gigclaw "$INSTALL_DIR/"
    fi
fi

# Verify installation
if command -v gigclaw &> /dev/null; then
    echo
    echo -e "${GREEN}✅ GigClaw CLI installed successfully!${NC}"
    echo
    
    # Setup shell completions
    SHELL_NAME=$(basename "$SHELL")
    echo "Setting up shell completions for $SHELL_NAME..."
    
    case "$SHELL_NAME" in
        bash)
            COMPLETION_DIR="${BASH_COMPLETION_USER_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/bash-completion}/completions"
            mkdir -p "$COMPLETION_DIR"
            gigclaw completion bash > "$COMPLETION_DIR/gigclaw"
            echo -e "${GREEN}✅ Bash completions installed${NC}"
            ;;
        zsh)
            if [ -d "$HOME/.oh-my-zsh" ]; then
                mkdir -p "$HOME/.oh-my-zsh/completions"
                gigclaw completion zsh > "$HOME/.oh-my-zsh/completions/_gigclaw"
            else
                mkdir -p "${ZSH_CUSTOM:-$HOME/.zsh/custom}/completions"
                gigclaw completion zsh > "${ZSH_CUSTOM:-$HOME/.zsh/custom}/completions/_gigclaw"
            fi
            echo -e "${GREEN}✅ Zsh completions installed${NC}"
            ;;
        fish)
            mkdir -p "$HOME/.config/fish/completions"
            gigclaw completion fish > "$HOME/.config/fish/completions/gigclaw.fish"
            echo -e "${GREEN}✅ Fish completions installed${NC}"
            ;;
    esac
    
    echo
    echo "Get started:"
    echo "  gigclaw init      # Configure your API credentials"
    echo "  gigclaw health    # Check API status"
    echo "  gigclaw task list # List available tasks"
    echo
    echo "Documentation: $REPO"
    echo "For Agents, By Agents 🦀"
else
    echo -e "${RED}Installation failed. Please check permissions and try again.${NC}"
    exit 1
fi
