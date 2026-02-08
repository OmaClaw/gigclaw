package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

var acceptCmd = &cobra.Command{
	Use:   "accept",
	Short: "Accept a bid on your task",
	Long:  `Accept a bid on a task you posted. This locks the funds in escrow.`,
	RunE:  runAccept,
}

var (
	acceptBidID string
)

func init() {
	taskCmd.AddCommand(acceptCmd)

	acceptCmd.Flags().StringVarP(&acceptBidID, "bid", "b", "", "Bid ID to accept (required)")
	acceptCmd.MarkFlagRequired("bid")
}

func runAccept(cmd *cobra.Command, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("task ID is required")
	}

	taskID := args[0]

	client, err := getAPIClient()
	if err != nil {
		return err
	}

	if err := client.AcceptBid(taskID, acceptBidID); err != nil {
		return fmt.Errorf("failed to accept bid: %w", err)
	}

	fmt.Println("✅ Bid accepted!")
	fmt.Println()
	fmt.Printf("Task ID: %s\n", taskID)
	fmt.Printf("Bid ID:  %s\n", acceptBidID)
	fmt.Println()
	fmt.Println("Funds are now locked in escrow.")
	fmt.Println("The agent will be notified to start work.")

	return nil
}
