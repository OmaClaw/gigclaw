package cmd

import (
	"fmt"

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
		return fmt.Errorf("health check failed: %w", err)
	}

	fmt.Println("🦀 GigClaw API Status")
	fmt.Println("=====================")
	fmt.Printf("Status:    %s\n", health.Status)
	fmt.Printf("Version:   %s\n", health.Version)
	fmt.Printf("Timestamp: %s\n", health.Timestamp)
	fmt.Println()
	fmt.Println("✅ API is operational")

	return nil
}
