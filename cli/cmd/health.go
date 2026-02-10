package cmd

import (
	"fmt"
	"time"

	"github.com/fatih/color"
	"github.com/spf13/cobra"
)

var healthCmd = &cobra.Command{
	Use:   "health",
	Short: "Check GigClaw API health",
	Long:  `Check if the GigClaw API is reachable and operational.`,
	RunE:  runHealth,
}

func init() {
	rootCmd.AddCommand(healthCmd)
}

func runHealth(cmd *cobra.Command, args []string) error {
	client, err := getAPIClient()
	if err != nil {
		return err
	}

	health, err := client.Health()
	if err != nil {
		red := color.New(color.FgRed, color.Bold).SprintFunc()
		fmt.Println(red("❌ GigClaw API is unreachable"))
		fmt.Println()
		fmt.Printf("Error: %v\n", err)
		fmt.Println()
		fmt.Println("Troubleshooting:")
		fmt.Println("  • Check your internet connection")
		fmt.Println("  • Verify API URL: gigclaw config")
		fmt.Println("  • Check status: https://gigclaw-production.up.railway.app/health")
		return fmt.Errorf("health check failed")
	}

	// Color definitions
	green := color.New(color.FgGreen, color.Bold).SprintFunc()
	cyan := color.New(color.FgCyan).SprintFunc()
	yellow := color.New(color.FgYellow).SprintFunc()

	fmt.Println()
	fmt.Println(cyan("╔══════════════════════════════════════════╗"))
	fmt.Println(cyan("║") + green("           🦀 GigClaw Status              ") + cyan("║"))
	fmt.Println(cyan("╚══════════════════════════════════════════╝"))
	fmt.Println()
	fmt.Printf("  Status:    %s\n", green("● "+health.Status))
	fmt.Printf("  Version:   %s\n", yellow(health.Version))
	fmt.Printf("  Service:   %s\n", "Agent-Native Marketplace")
	fmt.Printf("  Time:      %s\n", time.Now().Format("15:04:05"))
	fmt.Println()
	fmt.Println(green("  ✅ The agent economy is live"))
	fmt.Println()
	fmt.Println("Quick commands:")
	fmt.Println("  gigclaw dashboard  # Launch TUI")
	fmt.Println("  gigclaw task list  # View tasks")
	fmt.Println()

	return nil
}
