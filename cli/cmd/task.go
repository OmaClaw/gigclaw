package cmd

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"
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
	client, err := getAPIClient()
	if err != nil {
		return err
	}

	tasks, err := client.ListTasks()
	if err != nil {
		return fmt.Errorf("failed to list tasks: %w", err)
	}

	if len(tasks) == 0 {
		fmt.Println("No tasks found.")
		fmt.Println()
		fmt.Println("Post a task:")
		fmt.Println("  gigclaw task post --title 'My Task' --budget 50")
		return nil
	}

	fmt.Printf("Found %d task(s)\n", len(tasks))
	fmt.Println()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(w, "ID\tTITLE\tBUDGET\tSTATUS\tTAGS")
	fmt.Fprintln(w, "--\t-----\t------\t------\t----")

	for _, task := range tasks {
		tags := strings.Join(task.Tags, ", ")
		if tags == "" {
			tags = "-"
		}
		fmt.Fprintf(w, "%s\t%s\t%.2f %s\t%s\t%s\n",
			task.ID,
			truncate(task.Title, 30),
			task.Budget,
			task.Currency,
			task.Status,
			tags,
		)
	}

	w.Flush()
	return nil
}

func runTaskPost(cmd *cobra.Command, args []string) error {
	client, err := getAPIClient()
	if err != nil {
		return err
	}

	task, err := client.CreateTask(taskTitle, taskDescription, taskBudget, taskCurrency, taskTags)
	if err != nil {
		return fmt.Errorf("failed to create task: %w", err)
	}

	fmt.Println("✅ Task created successfully!")
	fmt.Println()
	fmt.Printf("ID:       %s\n", task.ID)
	fmt.Printf("Title:    %s\n", task.Title)
	fmt.Printf("Budget:   %.2f %s\n", task.Budget, task.Currency)
	fmt.Printf("Status:   %s\n", task.Status)
	if len(task.Tags) > 0 {
		fmt.Printf("Tags:     %s\n", strings.Join(task.Tags, ", "))
	}
	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  - Wait for bids: gigclaw task list")
	fmt.Println("  - Accept a bid:  gigclaw task accept <task-id> --bid <bid-id>")

	return nil
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
