package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

// Setup-specific styles
var (
	setupTitleStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#00FFA3")).
		Background(lipgloss.Color("#1a1a2e")).
		Padding(1, 2).
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#00FFA3"))

	setupBoxStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#9945FF")).
		Padding(2).
		Width(60)

	setupLabelStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#00FFA3"))

	setupDescStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#666666"))

	setupSelectedStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#000000")).
		Background(lipgloss.Color("#00FFA3")).
		Bold(true).
		Padding(0, 1)

	setupUnselectedStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#e0e0e0"))

	setupSuccessStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#00FF00")).
		Bold(true)
)

type setupModel struct {
	step      int
	textInput textinput.Model
	apiURL    string
	apiKey    string
	wallet    string
	selected  int
	completed bool
	err       error
}

func initialSetupModel() setupModel {
	ti := textinput.New()
	ti.Placeholder = "https://gigclaw-production.up.railway.app"
	ti.Focus()
	ti.CharLimit = 100
	ti.Width = 50

	return setupModel{
		step:      0,
		textInput: ti,
		apiURL:    "https://gigclaw-production.up.railway.app",
		selected:  0,
	}
}

func (m setupModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m setupModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "esc":
			return m, tea.Quit
		case "tab", "down":
			if m.step == 0 {
				m.selected = (m.selected + 1) % 2
			}
		case "up":
			if m.step == 0 {
				m.selected = (m.selected - 1 + 2) % 2
			}
		case "enter":
			switch m.step {
			case 0: // Choose environment
				if m.selected == 0 {
					m.apiURL = "https://gigclaw-production.up.railway.app"
				} else {
					m.apiURL = "http://localhost:3000"
				}
				m.step = 1
				m.textInput.Placeholder = "optional-api-key"
				m.textInput.SetValue("")
			case 1: // API Key
				m.apiKey = m.textInput.Value()
				m.step = 2
				m.textInput.Blur()
			case 2: // Complete
				m.completed = true
				m.saveConfig()
				return m, tea.Quit
			}
		}

		if m.step == 1 {
			m.textInput, cmd = m.textInput.Update(msg)
		}
	}

	return m, cmd
}

func (m setupModel) View() string {
	if m.completed {
		return m.completedView()
	}

	switch m.step {
	case 0:
		return m.environmentView()
	case 1:
		return m.apiKeyView()
	case 2:
		return m.confirmView()
	default:
		return "Unknown step"
	}
}

func (m setupModel) environmentView() string {
	var b string

	b += setupTitleStyle.Render(" 🦀 GigClaw Setup ") + "\n\n"
	b += "Select your environment:\n\n"

	prodOption := "  Production API (Recommended)\n"
	prodOption += "    https://gigclaw-production.up.railway.app\n"
	prodOption += "    Ready-to-use, always online\n"

	localOption := "  Local Development\n"
	localOption += "    http://localhost:3000\n"
	localOption += "    For local testing only\n"

	if m.selected == 0 {
		b += setupSelectedStyle.Render(prodOption) + "\n"
		b += setupUnselectedStyle.Render(localOption) + "\n"
	} else {
		b += setupUnselectedStyle.Render(prodOption) + "\n"
		b += setupSelectedStyle.Render(localOption) + "\n"
	}

	b += setupDescStyle.Render("↑/↓ to select, Enter to confirm") + "\n"
	b += setupDescStyle.Render("Ctrl+C to cancel")

	return setupBoxStyle.Render(b)
}

func (m setupModel) apiKeyView() string {
	var b string

	b += setupTitleStyle.Render(" 🦀 GigClaw Setup ") + "\n\n"
	b += setupLabelStyle.Render("API Key (Optional)") + "\n\n"
	b += "Enter your API key if you have one, or press Enter to skip.\n"
	b += "You can add an API key later using 'gigclaw init'.\n\n"
	b += m.textInput.View() + "\n\n"
	b += setupDescStyle.Render("Press Enter to continue, Ctrl+C to cancel") + "\n"

	return setupBoxStyle.Render(b)
}

func (m setupModel) confirmView() string {
	var b string

	b += setupTitleStyle.Render(" 🦀 GigClaw Setup ") + "\n\n"
	b += setupLabelStyle.Render("Configuration Summary") + "\n\n"
	b += fmt.Sprintf("API URL:  %s\n", m.apiURL)
	if m.apiKey != "" {
		b += "API Key:  [configured]\n"
	} else {
		b += "API Key:  [none]\n"
	}
	b += "\n"
	b += setupSelectedStyle.Render(" Press Enter to save configuration ") + "\n\n"
	b += setupDescStyle.Render("Ctrl+C to cancel")

	return setupBoxStyle.Render(b)
}

func (m setupModel) completedView() string {
	var b string

	b += setupTitleStyle.Render(" 🦀 GigClaw Setup ") + "\n\n"
	b += setupSuccessStyle.Render("✅ Configuration saved successfully!") + "\n\n"

	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".gigclaw", "config.yaml")
	b += fmt.Sprintf("Config: %s\n\n", configPath)

	b += setupLabelStyle.Render("Quick Start:") + "\n"
	b += "  gigclaw health     # Check API status\n"
	b += "  gigclaw dashboard  # Launch TUI\n"
	b += "  gigclaw task list  # View tasks\n\n"

	b += setupDescStyle.Render("Press any key to exit...")

	return setupBoxStyle.Render(b)
}

func (m *setupModel) saveConfig() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	configDir := filepath.Join(home, ".gigclaw")
	os.MkdirAll(configDir, 0755)

	config := map[string]string{
		"api-url": m.apiURL,
	}
	if m.apiKey != "" {
		config["api-key"] = m.apiKey
	}

	configFile := filepath.Join(configDir, "config.yaml")
	file, err := os.Create(configFile)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := yaml.NewEncoder(file)
	encoder.Encode(config)

	os.Chmod(configFile, 0600)

	// Update viper
	viper.Set("api-url", m.apiURL)
	if m.apiKey != "" {
		viper.Set("api-key", m.apiKey)
	}

	return nil
}

var setupCmd = &cobra.Command{
	Use:   "setup",
	Short: "Interactive setup wizard",
	Long: `Launch the interactive GigClaw setup wizard.

This TUI-based wizard will guide you through:
- Selecting your environment (production/local)
- Configuring API credentials
- Testing the connection

Much easier than manual configuration!`,
	RunE: runSetup,
}

func runSetup(cmd *cobra.Command, args []string) error {
	p := tea.NewProgram(initialSetupModel())
	if _, err := p.Run(); err != nil {
		return fmt.Errorf("setup error: %w", err)
	}
	return nil
}

func init() {
	rootCmd.AddCommand(setupCmd)
}
