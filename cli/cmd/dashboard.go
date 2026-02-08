package cmd

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/table"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
)

// Styles for the TUI
var (
	// Colors
	titleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#00FFA3")). // Solana green
		Background(lipgloss.Color("#1a1a2e")).
		Padding(0, 1)

	headerStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FFFFFF")).
		Background(lipgloss.Color("#16213e")).
		Padding(0, 1)

	selectedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#000000")).
		Background(lipgloss.Color("#00FFA3"))

	normalStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#e0e0e0"))

	dimStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#666666"))

	// Box styles
	boxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#00FFA3")).
		Padding(1, 2)

	statusOnline = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00FF00")).
		Render("●")

	statusOffline = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF0000")).
		Render("●")
)

// Model for the TUI
type dashboardModel struct {
	spinner    spinner.Model
	taskTable  table.Model
	tasks      []Task
	loading    bool
	err        error
	width      int
	height     int
	activeTab  int
	tabs       []string
	client     *Client
	lastUpdate time.Time
}

// Tab constants
const (
	TabTasks = iota
	TabBids
	TabProfile
)

type tasksMsg []Task
type errMsg error

func (m dashboardModel) Init() tea.Cmd {
	return tea.Batch(
		m.spinner.Tick,
		fetchTasksCmd(m.client),
	)
}

func fetchTasksCmd(client *Client) tea.Cmd {
	return func() tea.Msg {
		tasks, err := client.ListTasks()
		if err != nil {
			return errMsg(err)
		}
		return tasksMsg(tasks)
	}
}

func (m dashboardModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "tab":
			m.activeTab = (m.activeTab + 1) % len(m.tabs)
			return m, nil
		case "shift+tab":
			m.activeTab = (m.activeTab - 1 + len(m.tabs)) % len(m.tabs)
			return m, nil
		case "r":
			m.loading = true
			return m, fetchTasksCmd(m.client)
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		// Adjust table columns based on width
		columns := []table.Column{
			{Title: "ID", Width: 10},
			{Title: "Title", Width: m.width/3 - 10},
			{Title: "Budget", Width: 12},
			{Title: "Status", Width: 12},
		}
		m.taskTable.SetColumns(columns)
		m.taskTable.SetHeight(m.height - 10)
		return m, nil

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case tasksMsg:
		m.tasks = msg
		m.loading = false
		m.lastUpdate = time.Now()
		
		// Update table rows
		rows := []table.Row{}
		for _, task := range m.tasks {
			status := getStatusIcon(task.Status)
			rows = append(rows, table.Row{
				task.ID,
				truncate(task.Title, m.width/3-15),
				fmt.Sprintf("%.2f %s", task.Budget, task.Currency),
				status,
			})
		}
		m.taskTable.SetRows(rows)
		
		// Refresh after 30 seconds
		return m, tea.Tick(time.Second*30, func(t time.Time) tea.Msg {
			return fetchTasksCmd(m.client)()
		})

	case errMsg:
		m.err = msg
		m.loading = false
		return m, nil
	}

	var cmd tea.Cmd
	m.taskTable, cmd = m.taskTable.Update(msg)
	return m, cmd
}

func getStatusIcon(status string) string {
	switch strings.ToLower(status) {
	case "posted":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#00FF00")).Render("● Posted")
	case "in_progress":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#FFA500")).Render("◐ In Progress")
	case "completed":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#00BFFF")).Render("◉ Completed")
	case "verified":
		return lipgloss.NewStyle().Foreground(lipgloss.Color("#808080")).Render("✓ Verified")
	default:
		return status
	}
}

func (m dashboardModel) View() string {
	if m.err != nil {
		return fmt.Sprintf("\n  Error: %v\n\n  Press 'q' to quit.\n", m.err)
	}

	var b strings.Builder

	// Title bar
	b.WriteString(titleStyle.Render(" 🦀 GigClaw Dashboard "))
	b.WriteString("\n\n")

	// Status bar
	status := statusOnline
	if m.loading {
		status = m.spinner.View()
	}
	b.WriteString(fmt.Sprintf("  %s API: Connected  |  Last update: %s  |  Press 'r' to refresh, 'q' to quit\n",
		status,
		m.lastUpdate.Format("15:04:05")))
	b.WriteString("\n")

	// Tabs
	tabs := []string{"Tasks", "Bids", "Profile"}
	for i, tab := range tabs {
		if i == m.activeTab {
			b.WriteString(selectedStyle.Render(" "+tab+" "))
		} else {
			b.WriteString(normalStyle.Render(" "+tab+" "))
		}
		b.WriteString(" ")
	}
	b.WriteString("\n\n")

	// Content based on active tab
	switch m.activeTab {
	case TabTasks:
		if m.loading && len(m.tasks) == 0 {
			b.WriteString(fmt.Sprintf("\n  %s Loading tasks...\n", m.spinner.View()))
		} else if len(m.tasks) == 0 {
			b.WriteString("\n  No tasks found.\n")
			b.WriteString(dimStyle.Render("\n  Use 'gigclaw task post' to create your first task.\n"))
		} else {
			b.WriteString(boxStyle.Render(m.taskTable.View()))
		}
	case TabBids:
		b.WriteString("\n  Bids feature coming soon...\n")
	case TabProfile:
		b.WriteString("\n  Profile feature coming soon...\n")
	}

	// Help footer
	b.WriteString("\n\n")
	b.WriteString(dimStyle.Render("  Tab: Switch tabs  |  ↑/↓: Navigate  |  r: Refresh  |  q: Quit"))

	return b.String()
}

var dashboardCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Launch interactive terminal dashboard",
	Long: `Launch the GigClaw interactive terminal dashboard.

Navigate with arrow keys, switch tabs with Tab/Shift+Tab.
Press 'r' to refresh data, 'q' to quit.

Features:
- Real-time task feed
- Live status updates
- Keyboard navigation
- Beautiful TUI interface`,
	RunE: runDashboard,
}

func runDashboard(cmd *cobra.Command, args []string) error {
	client, err := getAPIClient()
	if err != nil {
		return err
	}

	// Test connection first
	if _, err := client.Health(); err != nil {
		return fmt.Errorf("cannot connect to API: %w", err)
	}

	// Configure spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#00FFA3"))

	// Configure table
	columns := []table.Column{
		{Title: "ID", Width: 10},
		{Title: "Title", Width: 30},
		{Title: "Budget", Width: 12},
		{Title: "Status", Width: 12},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(20),
	)

	// Style the table
	t.SetStyles(table.Styles{
		Header: headerStyle,
		Selected: selectedStyle,
		Cell: normalStyle,
	})

	// Clear screen for TUI
	fmt.Print("\033[H\033[2J")

	// Run the TUI
	m := dashboardModel{
		spinner:   s,
		taskTable: t,
		loading:   true,
		tabs:      []string{"Tasks", "Bids", "Profile"},
		client:    client,
	}

	p := tea.NewProgram(m, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("dashboard error: %w", err)
	}

	return nil
}

func init() {
	rootCmd.AddCommand(dashboardCmd)
}
