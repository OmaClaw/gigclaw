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

// Solana-inspired color palette
const (
	colorSolanaGreen = "#00FFA3"
	colorSolanaPurple = "#9945FF"
	colorDarkBg      = "#1a1a2e"
	colorDarkerBg    = "#16213e"
	colorText        = "#e0e0e0"
	colorDimText     = "#666666"
	colorWhite       = "#FFFFFF"
)

// Styles for the TUI
var (
	titleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color(colorSolanaGreen)).
		Background(lipgloss.Color(colorDarkBg)).
		Padding(0, 2).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(colorSolanaGreen))

	headerStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color(colorWhite)).
		Background(lipgloss.Color(colorDarkerBg)).
		Padding(0, 1)

	selectedStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color(colorDarkBg)).
		Background(lipgloss.Color(colorSolanaGreen))

	normalStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color(colorText))

	dimStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color(colorDimText))

	boxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color(colorSolanaPurple)).
		Padding(1, 2)

	statusOnline = lipgloss.NewStyle().
		Foreground(lipgloss.Color(colorSolanaGreen)).
		Render("●")

	tabActive = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color(colorDarkBg)).
		Background(lipgloss.Color(colorSolanaGreen)).
		Padding(0, 2)

	tabInactive = lipgloss.NewStyle().
		Foreground(lipgloss.Color(colorText)).
		Padding(0, 2)

	helpStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color(colorDimText)).
		Italic(true)
)

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

const (
	TabTasks = iota
	TabStats
	TabHelp
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
		case "q", "ctrl+c", "esc":
			return m, tea.Quit
		case "tab", "right":
			m.activeTab = (m.activeTab + 1) % len(m.tabs)
			return m, nil
		case "shift+tab", "left":
			m.activeTab = (m.activeTab - 1 + len(m.tabs)) % len(m.tabs)
			return m, nil
		case "r", "f5":
			m.loading = true
			return m, fetchTasksCmd(m.client)
		case "?":
			m.activeTab = TabHelp
			return m, nil
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		
		tableWidth := m.width - 10
		if tableWidth < 60 {
			tableWidth = 60
		}
		
		columns := []table.Column{
			{Title: "ID", Width: 10},
			{Title: "Title", Width: tableWidth/3},
			{Title: "Budget", Width: 14},
			{Title: "Status", Width: 14},
		}
		m.taskTable.SetColumns(columns)
		m.taskTable.SetHeight(m.height - 12)
		return m, nil

	case spinner.TickMsg:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd

	case tasksMsg:
		m.tasks = msg
		m.loading = false
		m.lastUpdate = time.Now()
		
		rows := []table.Row{}
		for _, task := range m.tasks {
			status := formatStatus(task.Status)
			rows = append(rows, table.Row{
				truncate(task.ID, 10),
				truncate(task.Title, 40),
				fmt.Sprintf("%.2f %s", task.Budget, task.Currency),
				status,
			})
		}
		m.taskTable.SetRows(rows)
		
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


func (m dashboardModel) View() string {
	if m.err != nil {
		return fmt.Sprintf("\n  %s Error: %v\n\n  Press 'q' to quit.\n", 
			lipgloss.NewStyle().Foreground(lipgloss.Color("#FF4444")).Render("✗"), m.err)
	}

	var b strings.Builder

	b.WriteString(titleStyle.Render(" 🦀 GigClaw Dashboard "))
	b.WriteString("\n\n")

	status := statusOnline
	if m.loading {
		status = m.spinner.View()
	}
	
	statusLine := fmt.Sprintf("  %s API: %s  |  Last update: %s  |  %s tasks",
		status,
		normalStyle.Render("Connected"),
		m.lastUpdate.Format("15:04:05"),
		normalStyle.Render(fmt.Sprintf("%d", len(m.tasks))),
	)
	b.WriteString(statusLine)
	b.WriteString("\n\n")

	for i, tab := range m.tabs {
		if i == m.activeTab {
			b.WriteString(tabActive.Render(" " + tab + " "))
		} else {
			b.WriteString(tabInactive.Render(" " + tab + " "))
		}
		b.WriteString(" ")
	}
	b.WriteString("\n")
	b.WriteString(strings.Repeat("─", m.width-4))
	b.WriteString("\n\n")

	switch m.activeTab {
	case TabTasks:
		if m.loading && len(m.tasks) == 0 {
			b.WriteString(fmt.Sprintf("\n  %s Loading tasks...\n", m.spinner.View()))
		} else if len(m.tasks) == 0 {
			b.WriteString("\n  " + dimStyle.Render("No tasks found.\n"))
			b.WriteString("\n  Create your first task:\n")
			b.WriteString("  " + normalStyle.Render("gigclaw task post --title 'My Task' --budget 50"))
		} else {
			b.WriteString(boxStyle.Render(m.taskTable.View()))
		}
		
	case TabStats:
		b.WriteString(m.renderStats())
		
	case TabHelp:
		b.WriteString(m.renderHelp())
	}

	b.WriteString("\n\n")
	b.WriteString(helpStyle.Render("  tab/←→: Switch tabs  |  ↑/↓: Navigate  |  r: Refresh  |  q: Quit  |  ?: Help"))

	return b.String()
}

func (m dashboardModel) renderStats() string {
	var b strings.Builder
	
	posted := 0
	inProgress := 0
	completed := 0
	verified := 0
	
	for _, task := range m.tasks {
		switch strings.ToLower(task.Status) {
		case "posted":
			posted++
		case "in_progress", "inprogress":
			inProgress++
		case "completed":
			completed++
		case "verified":
			verified++
		}
	}
	
	b.WriteString("\n  📊 Task Statistics\n\n")
	b.WriteString(fmt.Sprintf("  %s Posted:      %d\n", 
		lipgloss.NewStyle().Foreground(lipgloss.Color(colorSolanaGreen)).Render("●"), posted))
	b.WriteString(fmt.Sprintf("  %s In Progress: %d\n", 
		lipgloss.NewStyle().Foreground(lipgloss.Color("#FFA500")).Render("◐"), inProgress))
	b.WriteString(fmt.Sprintf("  %s Completed:   %d\n", 
		lipgloss.NewStyle().Foreground(lipgloss.Color("#00BFFF")).Render("◉"), completed))
	b.WriteString(fmt.Sprintf("  %s Verified:    %d\n", 
		lipgloss.NewStyle().Foreground(lipgloss.Color(colorDimText)).Render("✓"), verified))
	b.WriteString("\n")
	b.WriteString(fmt.Sprintf("  Total: %d tasks\n", len(m.tasks)))
	
	return b.String()
}

func (m dashboardModel) renderHelp() string {
	var b strings.Builder
	
	b.WriteString("\n  📖 Keyboard Shortcuts\n\n")
	b.WriteString("  Tab / →     Next tab\n")
	b.WriteString("  Shift+Tab / ←  Previous tab\n")
	b.WriteString("  ↑ / ↓       Navigate list\n")
	b.WriteString("  r / F5      Refresh data\n")
	b.WriteString("  ?           Show this help\n")
	b.WriteString("  q / Esc     Quit dashboard\n")
	b.WriteString("\n")
	b.WriteString("  📚 CLI Commands\n\n")
	b.WriteString("  gigclaw task list       View all tasks\n")
	b.WriteString("  gigclaw task post       Create a new task\n")
	b.WriteString("  gigclaw task bid        Bid on a task\n")
	b.WriteString("  gigclaw doctor          Run diagnostics\n")
	
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
- Task statistics
- Keyboard navigation
- Beautiful TUI interface
- Auto-refresh every 30 seconds`,
	RunE: runDashboard,
}

func runDashboard(cmd *cobra.Command, args []string) error {
	client, err := getAPIClient()
	if err != nil {
		return err
	}

	if _, err := client.Health(); err != nil {
		return fmt.Errorf("cannot connect to API: %w", err)
	}

	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(colorSolanaGreen))

	columns := []table.Column{
		{Title: "ID", Width: 10},
		{Title: "Title", Width: 30},
		{Title: "Budget", Width: 14},
		{Title: "Status", Width: 14},
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithFocused(true),
		table.WithHeight(20),
	)

	t.SetStyles(table.Styles{
		Header:   headerStyle,
		Selected: selectedStyle,
		Cell:     normalStyle,
	})

	m := dashboardModel{
		spinner:   s,
		taskTable: t,
		loading:   true,
		tabs:      []string{"Tasks", "Stats", "Help"},
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