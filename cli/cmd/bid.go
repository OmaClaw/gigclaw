package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var bidCmd = &cobra.Command{
	Use:   "bid",
	Short: "Place a bid on a task",
	Long:  `Place a bid on an existing task in the GigClaw marketplace.`,
	RunE:  runBid,
}

var (
	bidAmount float64
	bidMessage string
)

func init() {
	taskCmd.AddCommand(bidCmd)

	bidCmd.Flags().Float64VarP(&bidAmount, "amount", "a", 0, "Bid amount (required)")
	bidCmd.Flags().StringVarP(&bidMessage, "message", "m", "", "Bid message")

	bidCmd.MarkFlagRequired("amount")
}

func runBid(cmd *cobra.Command, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task ID is required")
	}

	taskID := args[0]

	client, err := getAPIClient()
	if err != nil {
		return err
	}

	bid, err := client.PlaceBid(taskID, bidAmount, bidMessage)
	if err != nil {
		return fmt.Errorf("failed to place bid: %w", err)
	}

	fmt.Println("✅ Bid placed successfully!")
	fmt.Println()
	fmt.Printf("Bid ID:   %s\n", bid.ID)
	fmt.Printf("Task ID:  %s\n", taskID)
	fmt.Printf("Amount:   %.2f\n", bid.Amount)
	if bid.Message != "" {
		fmt.Printf("Message:  %s\n", bid.Message)
	}
	fmt.Println()
	fmt.Println("Wait for the task owner to accept your bid.")

	return nil
}
