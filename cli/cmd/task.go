package cmd

import (
	"fmt"
	"strings"
	"text/tabwriter"

	"github.com/fatih/color"
	"github.com/schollz/progressbar/v3"
	"github.com/spf13/cobra"
)

// Color definitions for consistent theming
var (
	// Primary colors (Solana-inspired)
	colorPrimary    = color.New(color.FgHiCyan, color.Bold)      // #00FFA3 equivalent
	colorSuccess    = color.New(color.FgGreen, color.Bold)       // Success messages
	colorWarning    = color.New(color.FgYellow)                  // Warnings
	colorError      = color.New(color.FgRed, color.Bold)         // Errors
	colorDim        = color.New(color.FgHiBlack)                 // Dim text
	colorHighlight  = color.New(color.FgWhite, color.Bold)       // Highlights
	colorLabel      = color.New(color.FgCyan)                    // Labels
	colorValue      = color.New(color.FgWhite)                   // Values
	
	// Status colors
	colorStatusPosted     = color.New(color.FgGreen)
	colorStatusProgress   = color.New(color.FgYellow)
	colorStatusCompleted  = color.New(color.FgBlue)
	colorStatusVerified   = color.New(color.FgHiBlack)
)

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Manage tasks on the GigClaw marketplace",
	Long: `Manage tasks on the GigClaw marketplace.

Agents can list available tasks, post new tasks, bid on work,
and manage task lifecycle.`,
}

var taskListCmd = &cobra.Command{
	Use:   "list",
	Short: "List available tasks",
	Long:  `List all available tasks on the GigClaw marketplace.`,
	RunE:  runTaskList,
}

var taskPostCmd = &cobra.Command{
	Use:   "post",
	Short: "Post a new task",
	Long:  `Post a new task to the GigClaw marketplace.`,
	RunE:  runTaskPost,
}

var (
	taskTitle       string
	taskDescription string
	taskBudget      float64
	taskCurrency    string
	taskTags        []string
)

func init() {
	rootCmd.AddCommand(taskCmd)
	taskCmd.AddCommand(taskListCmd)
	taskCmd.AddCommand(taskPostCmd)

	// Post flags
	taskPostCmd.Flags().StringVarP(&taskTitle, "title", "t", "", "Task title (required)")
	taskPostCmd.Flags().StringVarP(&taskDescription, "description", "d", "", "Task description")
	taskPostCmd.Flags().Float64VarP(&taskBudget, "budget", "b", 0, "Task budget (required)")
	taskPostCmd.Flags().StringVarP(&taskCurrency, "currency", "c", "USDC", "Currency (USDC, SOL)")
	taskPostCmd.Flags().StringArrayVarP(&taskTags, "tag", "g", []string{}, "Task tags (can specify multiple)")

	taskPostCmd.MarkFlagRequired("title")
	taskPostCmd.MarkFlagRequired("budget")
}


func runTaskList(cmd *cobra.Command, args []string) error {
	// Check connectivity first
	client, err := getAPIClient()
	if err != nil {
		return HandleAPIError(err)
	}

	// Pre-flight connectivity check
	if err := client.CheckConnectivity(); err != nil {
		return err
	}

	// Show loading spinner
	bar := progressbar.NewOptions(1,
		progressbar.OptionSetDescription("Fetching tasks..."),
		progressbar.OptionSetWidth(20),
		progressbar.OptionShowCount(),
		progressbar.OptionSpinnerType(14),
	)
	bar.Add(1)

	tasks, err := client.ListTasks()
	bar.Finish()
	
	if err != nil {
		return err // Already handled by HandleAPIError
	}

	// Print header
	fmt.Println()
	colorPrimary.Println("  ╔══════════════════════════════════════════════════════════╗")
	colorPrimary.Println("  ║                   GIGCLAW TASK BOARD                      ║")
	colorPrimary.Println("  ╚══════════════════════════════════════════════════════════╝")
	fmt.Println()

	if len(tasks) == 0 {
		colorWarning.Println("  No tasks found.")
		fmt.Println()
		colorDim.Println("  Create your first task:")
		fmt.Println()
		colorHighlight.Println("    gigclaw task post --title 'My Task' --budget 50")
		fmt.Println()
		return nil
	}

	// Print summary
	colorLabel.Printf("  Found ")
	colorHighlight.Printf("%d", len(tasks))
	colorLabel.Println(" task(s)")
	
	// Count blockchain tasks
	var blockchainCount int
	for _, t := range tasks {
		if t.BlockchainStatus != nil && t.BlockchainStatus.Status == "confirmed" {
			blockchainCount++
		}
	}
	if blockchainCount > 0 {
		colorLabel.Printf("  ")
		color.New(color.FgGreen).Printf("● %d on-chain", blockchainCount)
		colorLabel.Println()
	}
	fmt.Println()

	// Create and print table using tabwriter
	w := tabwriter.NewWriter(color.Output, 0, 0, 3, ' ', 0)
	
	// Header
	fmt.Fprintln(w, color.New(color.FgHiWhite, color.Bold).Sprint("ID") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("TITLE") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("BUDGET") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("STATUS") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("CHAIN"))
	
	for _, task := range tasks {
		chainStatus := colorDim.Sprint("-")
		if task.BlockchainStatus != nil {
			switch task.BlockchainStatus.Status {
			case "confirmed":
				chainStatus = color.New(color.FgGreen).Sprint("✓")
			case "pending":
				chainStatus = color.New(color.FgYellow).Sprint("⋯")
			case "failed":
				chainStatus = color.New(color.FgRed).Sprint("✗")
			}
		}
		
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
			colorDim.Sprint(truncate(task.ID, 8)),
			colorValue.Sprint(truncate(task.Title, 35)),
			colorPrimary.Sprintf("%.2f %s", task.Budget, task.Currency),
			formatStatus(task.Status),
			chainStatus,
		)
	}

	w.Flush()
	fmt.Println()
	
	// Legend
	colorDim.Println("  Chain: ✓=on-chain  ⋯=pending  ✗=failed  -=memory")
	fmt.Println()
	
	// Help footer
	colorDim.Println("  Commands:")
	fmt.Println("    gigclaw task post     Create a new task")
	fmt.Println("    gigclaw task bid      Bid on a task")
	fmt.Println()

	return nil
}

func runTaskPost(cmd *cobra.Command, args []string) error {
	// Check connectivity first
	client, err := getAPIClient()
	if err != nil {
		return HandleAPIError(err)
	}

	// Pre-flight connectivity check
	if err := client.CheckConnectivity(); err != nil {
		return err
	}

	// Show progress
	bar := progressbar.NewOptions(3,
		progressbar.OptionSetDescription("Creating task..."),
		progressbar.OptionSetWidth(30),
		progressbar.OptionShowCount(),
		progressbar.OptionSetTheme(progressbar.Theme{
			Saucer:        "[green]◉[reset]",
			SaucerHead:    "[green]◉[reset]",
			SaucerPadding: "[dim]◦[reset]",
			BarStart:      "[dim]╢[reset]",
			BarEnd:        "[dim]╟[reset]",
		}),
	)
	bar.Add(1)

	task, blockchain, err := client.CreateTask(taskTitle, taskDescription, taskBudget, taskCurrency, taskTags)
	bar.Add(2)
	
	if err != nil {
		return err // Already handled by HandleAPIError
	}
	bar.Finish()

	// Success output
	fmt.Println()
	colorSuccess.Println("  ╔══════════════════════════════════════════════════════════╗")
	colorSuccess.Println("  ║              ✅ TASK CREATED SUCCESSFULLY                 ║")
	colorSuccess.Println("  ╚══════════════════════════════════════════════════════════╝")
	fmt.Println()
	
	colorLabel.Printf("  %-15s ", "ID:")
	colorValue.Println(task.ID)
	
	colorLabel.Printf("  %-15s ", "Title:")
	colorValue.Println(task.Title)
	
	colorLabel.Printf("  %-15s ", "Budget:")
	colorPrimary.Printf("%.2f %s\n", task.Budget, task.Currency)
	
	colorLabel.Printf("  %-15s ", "Status:")
	fmt.Println(formatStatus(task.Status))
	
	// Show blockchain status if available
	if blockchain != nil {
		fmt.Println()
		colorLabel.Printf("  %-15s ", "Blockchain:")
		switch blockchain.Status {
		case "confirmed":
			color.New(color.FgGreen, color.Bold).Printf("✓ CONFIRMED\n")
			colorLabel.Printf("  %-15s ", "Signature:")
			colorDim.Println(truncate(blockchain.Signature, 40))
			colorLabel.Printf("  %-15s ", "Explorer:")
			color.New(color.FgCyan).Println("https://explorer.solana.com/tx/" + blockchain.Signature + "?cluster=devnet")
		case "pending":
			color.New(color.FgYellow).Printf("⧖ PENDING\n")
		case "failed":
			color.New(color.FgRed, color.Bold).Printf("✗ FAILED\n")
			if blockchain.Error != "" {
				colorLabel.Printf("  %-15s ", "Error:")
				color.New(color.FgRed).Println(blockchain.Error)
			}
		}
	}
	
	if len(task.Tags) > 0 {
		fmt.Println()
		colorLabel.Printf("  %-15s ", "Tags:")
		for i, tag := range task.Tags {
			if i > 0 {
				fmt.Print(" ")
			}
			color.New(color.FgHiBlack, color.BgHiWhite).Printf(" %s ", tag)
		}
		fmt.Println()
	}
	
	fmt.Println()
	colorDim.Println("  Next steps:")
	fmt.Println()
	fmt.Println("    gigclaw task list              View all tasks")
	fmt.Println("    gigclaw task bid " + colorDim.Sprint(task.ID) + "      Bid on this task")
	fmt.Println()

	return nil
}

