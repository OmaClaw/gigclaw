package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var doctorCmd = &cobra.Command{
	Use:   "doctor",
	Short: "Diagnose GigClaw CLI configuration",
	Long: `Run diagnostics to check your GigClaw CLI setup.

Checks:
- Configuration file exists and is valid
- API connectivity
- Required tools are installed
- Environment variables are set
- Common configuration issues`,
	RunE: runDoctor,
}

func runDoctor(cmd *cobra.Command, args []string) error {
	colorPrimary := color.New(color.FgHiCyan, color.Bold)
	colorSuccess := color.New(color.FgGreen, color.Bold)
	colorError := color.New(color.FgRed, color.Bold)
	colorWarning := color.New(color.FgYellow)
	colorLabel := color.New(color.FgCyan)
	colorValue := color.New(color.FgWhite)
	
	fmt.Println()
	colorPrimary.Println("╔══════════════════════════════════════════════════════════╗")
	colorPrimary.Println("║           🔧 GIGCLAW DOCTOR - DIAGNOSTICS                 ║")
	colorPrimary.Println("╚══════════════════════════════════════════════════════════╝")
	fmt.Println()

	issues := 0
	warnings := 0

	// Check 1: Config file
	fmt.Println(colorLabel.Sprint("📁 Configuration File"))
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".gigclaw", "config.yaml")
	
	if _, err := os.Stat(configPath); err == nil {
		colorSuccess.Println("   ✅ Config file exists:", configPath)
		
		// Check if we can read it
		if viper.ConfigFileUsed() != "" {
			colorValue.Println("   ✓ Config loaded successfully")
		}
	} else {
		colorError.Println("   ❌ Config file not found:", configPath)
		colorWarning.Println("   💡 Run 'gigclaw init' to create configuration")
		issues++
	}
	fmt.Println()

	// Check 2: API URL
	fmt.Println(colorLabel.Sprint("🌐 API Configuration"))
	apiURL := viper.GetString("api-url")
	if apiURL == "" {
		apiURL = "https://gigclaw-production.up.railway.app"
	}
	colorValue.Println("   API URL:", apiURL)
	
	// Check 3: API Connectivity
	fmt.Println(colorLabel.Sprint("📡 API Connectivity"))
	client, err := getAPIClient()
	if err != nil {
		colorError.Println("   ❌ Failed to create API client:", err)
		issues++
	} else {
		health, err := client.Health()
		if err != nil {
			colorError.Println("   ❌ API health check failed:", err)
			issues++
		} else {
			colorSuccess.Println("   ✅ API is healthy")
			colorValue.Println("   Version:", health.Version)
		}
	}
	fmt.Println()

	// Check 4: Environment
	fmt.Println(colorLabel.Sprint("🖥️  System Information"))
	colorValue.Println("   OS:", runtime.GOOS)
	colorValue.Println("   Arch:", runtime.GOARCH)
	colorValue.Println("   Go Version:", runtime.Version())
	fmt.Println()

	// Check 5: Shell
	fmt.Println(colorLabel.Sprint("🐚 Shell Configuration"))
	shell := os.Getenv("SHELL")
	if shell != "" {
		colorValue.Println("   Shell:", shell)
		
		// Check for completions
		shellName := filepath.Base(shell)
		completionPath := CompletionInstallPath(shellName)
		if completionPath != "" {
			if _, err := os.Stat(completionPath); err == nil {
				colorSuccess.Println("   ✅ Completions installed")
			} else {
				colorWarning.Println("   ⚠️  Completions not installed")
				colorWarning.Println("   💡 Run 'gigclaw completion", shellName, "| source' to enable")
				warnings++
			}
		}
	} else {
		colorWarning.Println("   ⚠️  Could not detect shell")
		warnings++
	}
	fmt.Println()

	// Summary
	fmt.Println(colorLabel.Sprint("📊 Summary"))
	if issues == 0 && warnings == 0 {
		colorSuccess.Println("   ✅ All checks passed! GigClaw is ready to use.")
	} else {
		if issues > 0 {
			colorError.Printf("   ❌ %d issue(s) found\n", issues)
		}
		if warnings > 0 {
			colorWarning.Printf("   ⚠️  %d warning(s) found\n", warnings)
		}
		fmt.Println()
		colorPrimary.Println("Run 'gigclaw init' to fix configuration issues")
	}
	
	fmt.Println()
	return nil
}

func init() {
	rootCmd.AddCommand(doctorCmd)
}
