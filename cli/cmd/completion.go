package cmd

import (
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var completionCmd = &cobra.Command{
	Use:   "completion [bash|zsh|fish|powershell]",
	Short: "Generate shell completion script",
	Long: `Generate shell completion script for GigClaw CLI.

To load completions:

Bash:
  $ source <(gigclaw completion bash)
  # To load completions for each session, execute once:
  # Linux:
  $ gigclaw completion bash > /etc/bash_completion.d/gigclaw
  # macOS:
  $ gigclaw completion bash > $(brew --prefix)/etc/bash_completion.d/gigclaw

Zsh:
  $ source <(gigclaw completion zsh)
  # To load completions for each session, execute once:
  $ gigclaw completion zsh > "${fpath[1]}/_gigclaw"

Fish:
  $ gigclaw completion fish | source
  # To load completions for each session, execute once:
  $ gigclaw completion fish > ~/.config/fish/completions/gigclaw.fish

PowerShell:
  PS> gigclaw completion powershell | Out-String | Invoke-Expression
  # To load completions for every new session, run:
  PS> gigclaw completion powershell > gigclaw.ps1
  # and source this file from your PowerShell profile.
`,
	DisableFlagsInUseLine: true,
	ValidArgs:             []string{"bash", "zsh", "fish", "powershell"},
	Args:                  cobra.ExactValidArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		switch args[0] {
		case "bash":
			cmd.Root().GenBashCompletion(os.Stdout)
		case "zsh":
			cmd.Root().GenZshCompletion(os.Stdout)
		case "fish":
			cmd.Root().GenFishCompletion(os.Stdout, true)
		case "powershell":
			cmd.Root().GenPowerShellCompletionWithDesc(os.Stdout)
		}
	},
}

// SetupCompletionScript creates a helper script for easy completion setup
func SetupCompletionScript() string {
	return `#!/bin/bash
# GigClaw Shell Completion Setup Script
# Run: curl -sSL https://gigclaw.sh/completion | bash

echo "🦀 Setting up GigClaw shell completions..."

# Detect shell
SHELL_NAME=$(basename "$SHELL")

case "$SHELL_NAME" in
    bash)
        echo "Detected Bash shell"
        COMPLETION_DIR="${BASH_COMPLETION_USER_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/bash-completion}/completions"
        mkdir -p "$COMPLETION_DIR"
        gigclaw completion bash > "$COMPLETION_DIR/gigclaw"
        echo "✅ Bash completions installed to: $COMPLETION_DIR/gigclaw"
        echo ""
        echo "Reload your shell or run: source ~/.bashrc"
        ;;
    zsh)
        echo "Detected Zsh shell"
        # Check if using oh-my-zsh
        if [ -d "$HOME/.oh-my-zsh" ]; then
            mkdir -p "$HOME/.oh-my-zsh/completions"
            gigclaw completion zsh > "$HOME/.oh-my-zsh/completions/_gigclaw"
            echo "✅ Zsh completions installed to: $HOME/.oh-my-zsh/completions/_gigclaw"
        else
            # Standard zsh location
            mkdir -p "${ZSH_CUSTOM:-$HOME/.zsh/custom}/completions"
            gigclaw completion zsh > "${ZSH_CUSTOM:-$HOME/.zsh/custom}/completions/_gigclaw"
            echo "✅ Zsh completions installed to: ${ZSH_CUSTOM:-$HOME/.zsh/custom}/completions/_gigclaw"
        fi
        echo ""
        echo "Reload your shell or run: source ~/.zshrc"
        ;;
    fish)
        echo "Detected Fish shell"
        mkdir -p "$HOME/.config/fish/completions"
        gigclaw completion fish > "$HOME/.config/fish/completions/gigclaw.fish"
        echo "✅ Fish completions installed to: $HOME/.config/fish/completions/gigclaw.fish"
        ;;
    *)
        echo "❓ Unknown shell: $SHELL_NAME"
        echo "Please manually install completions using:"
        echo "  gigclaw completion $SHELL_NAME > /path/to/completions"
        exit 1
        ;;
esac

echo ""
echo "For Agents, By Agents 🦀"
`
}

// WriteCompletionScript writes the completion setup script to a file
func WriteCompletionScript(path string) error {
	script := SetupCompletionScript()
	return os.WriteFile(path, []byte(script), 0755)
}

// CompletionInstallPath returns the recommended installation path for completions
func CompletionInstallPath(shell string) string {
	home, _ := os.UserHomeDir()
	
	switch shell {
	case "bash":
		return filepath.Join(home, ".local", "share", "bash-completion", "completions", "gigclaw")
	case "zsh":
		return filepath.Join(home, ".zsh", "completions", "_gigclaw")
	case "fish":
		return filepath.Join(home, ".config", "fish", "completions", "gigclaw.fish")
	default:
		return ""
	}
}

func init() {
	rootCmd.AddCommand(completionCmd)
}
