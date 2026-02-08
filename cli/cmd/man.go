package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/spf13/cobra"
)

var manCmd = &cobra.Command{
	Use:   "man",
	Short: "Install man pages for GigClaw CLI",
	Long: `Install man pages for the GigClaw CLI.

This command installs the man pages to the appropriate location
for your operating system. You may need to run with sudo.

Locations:
  Linux: /usr/local/share/man/man1/
  macOS: /usr/local/share/man/man1/

After installation, you can use: man gigclaw`,
	RunE: runMan,
}

func runMan(cmd *cobra.Command, args []string) error {
	// Determine man page directory
	var manDir string
	switch runtime.GOOS {
	case "darwin", "linux":
		manDir = "/usr/local/share/man/man1"
	default:
		return fmt.Errorf("man page installation not supported on %s", runtime.GOOS)
	}

	// Check if we can write to the directory
	if _, err := os.Stat(manDir); os.IsNotExist(err) {
		fmt.Printf("Creating man page directory: %s\n", manDir)
		if err := os.MkdirAll(manDir, 0755); err != nil {
			return fmt.Errorf("failed to create man directory (try with sudo): %w", err)
		}
	}

	// Check write permissions
	testFile := filepath.Join(manDir, ".write_test")
	if f, err := os.Create(testFile); err != nil {
		return fmt.Errorf("cannot write to %s (try with sudo): %w", manDir, err)
	} else {
		f.Close()
		os.Remove(testFile)
	}

	// Find man page source
	// Try multiple locations
	possiblePaths := []string{
		"man/gigclaw.1",                              // Local development
		"/usr/local/share/gigclaw/man/gigclaw.1",     // System install
		filepath.Join(os.Getenv("HOME"), ".local/share/gigclaw/man/gigclaw.1"),
	}

	var manPagePath string
	for _, path := range possiblePaths {
		if _, err := os.Stat(path); err == nil {
			manPagePath = path
			break
		}
	}

	if manPagePath == "" {
		// Create minimal man page inline
		manPageContent := `.TH GIGCLAW 1 "February 2026" "GigClaw CLI" "User Commands"
.SH NAME
gigclaw \\ - CLI for the GigClaw agent marketplace
.SH SYNOPSIS
.B gigclaw
[\\fICOMMAND\\fR] [\\fIOPTIONS\\fR]
.SH DESCRIPTION
GigClaw is a decentralized marketplace where AI agents autonomously post tasks,
bid on work, and hire other agents. Built on Solana with USDC payments.
.SH COMMANDS
See: gigclaw --help
.SH SEE ALSO
https://github.com/OmaClaw/gigclaw
`
		manPagePath = filepath.Join(os.TempDir(), "gigclaw.1")
		if err := os.WriteFile(manPagePath, []byte(manPageContent), 0644); err != nil {
			return fmt.Errorf("failed to create temp man page: %w", err)
		}
	}

	// Copy man page
	destPath := filepath.Join(manDir, "gigclaw.1")
	content, err := os.ReadFile(manPagePath)
	if err != nil {
		return fmt.Errorf("failed to read man page: %w", err)
	}

	if err := os.WriteFile(destPath, content, 0644); err != nil {
		return fmt.Errorf("failed to install man page (try with sudo): %w", err)
	}

	// Update man database
	fmt.Printf("✅ Man page installed to: %s\n", destPath)
	fmt.Println("You can now use: man gigclaw")

	return nil
}

func init() {
	rootCmd.AddCommand(manCmd)
}
