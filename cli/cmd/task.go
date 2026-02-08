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

func formatStatus(status string) string {
	switch strings.ToLower(status) {
	case "posted":
		return colorStatusPosted.Sprintf("● %s", status)
	case "in_progress", "inprogress":
		return colorStatusProgress.Sprintf("◐ %s", status)
	case "completed":
		return colorStatusCompleted.Sprintf("◉ %s", status)
	case "verified":
		return colorStatusVerified.Sprintf("✓ %s", status)
	case "cancelled":
		return colorError.Sprintf("✗ %s", status)
	default:
		return status
	}
}

func runTaskList(cmd *cobra.Command, args []string) error {
	// Show loading spinner
	bar := progressbar.NewOptions(1,
		progressbar.OptionSetDescription("Fetching tasks..."),
		progressbar.OptionSetWidth(20),
		progressbar.OptionShowCount(),
		progressbar.OptionSpinnerType(14),
	)
	bar.Add(1)

	client, err := getAPIClient()
	if err != nil {
		return err
	}

	tasks, err := client.ListTasks()
	bar.Finish()
	
	if err != nil {
		return fmt.Errorf("%s failed to list tasks: %w", colorError.Sprint("✗"), err)
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
	fmt.Println()

	// Create and print table using tabwriter
	w := tabwriter.NewWriter(color.Output, 0, 0, 3, ' ', 0)
	
	// Header
	fmt.Fprintln(w, color.New(color.FgHiWhite, color.Bold).Sprint("ID") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("TITLE") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("BUDGET") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("STATUS") + "\t" +
		color.New(color.FgHiWhite, color.Bold).Sprint("TAGS"))
	
	for _, task := range tasks {
		tags := strings.Join(task.Tags, ", ")
		if tags == "" {
			tags = colorDim.Sprint("-")
		}
		
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
			colorDim.Sprint(truncate(task.ID, 8)),
			colorValue.Sprint(truncate(task.Title, 35)),
			colorPrimary.Sprintf("%.2f %s", task.Budget, task.Currency),
			formatStatus(task.Status),
			tags,
		)
	}

	w.Flush()
	fmt.Println()
	
	// Help footer
	colorDim.Println("  Commands:")
	fmt.Println("    gigclaw task post     Create a new task")
	fmt.Println("    gigclaw task bid      Bid on a task")
	fmt.Println()

	return nil
}

func runTaskPost(cmd *cobra.Command, args []string) error {
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

	client, err := getAPIClient()
	if err != nil {
		return err
	}
	bar.Add(1)

	task, err := client.CreateTask(taskTitle, taskDescription, taskBudget, taskCurrency, taskTags)
	bar.Add(2)
	
	if err != nil {
		return fmt.Errorf("%s failed to create task: %w", colorError.Sprint("✗"), err)
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
	
	if len(task.Tags) > 0 {
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

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + colorDim.Sprint("...")
}
