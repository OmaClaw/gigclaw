package cmd

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Initialize GigClaw configuration",
	Long: `Initialize GigClaw CLI with your API credentials.

This creates a configuration file at ~/.gigclaw/config.yaml with your settings.`,
	RunE: runInit,
}

func init() {
	rootCmd.AddCommand(initCmd)
}

func runInit(cmd *cobra.Command, args []string) error {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("🦀 GigClaw CLI Setup")
	fmt.Println("====================")
	fmt.Println()

	// Get API URL
	apiURL := viper.GetString("api-url")
	if apiURL == "" {
		apiURL = "https://gigclaw-production.up.railway.app"
	}
	fmt.Printf("API URL [%s]: ", apiURL)
	input, _ := reader.ReadString('\n')
	if input = input[:len(input)-1]; input != "" {
		apiURL = input
	}

	// Get API Key
	fmt.Print("API Key (optional, press Enter to skip): ")
	apiKey, _ := reader.ReadString('\n')
	apiKey = apiKey[:len(apiKey)-1]

	// Create config directory
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	configDir := filepath.Join(home, ".gigclaw")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Create config file
	config := map[string]string{
		"api-url": apiURL,
	}
	if apiKey != "" {
		config["api-key"] = apiKey
	}

	configFile := filepath.Join(configDir, "config.yaml")
	file, err := os.Create(configFile)
	if err != nil {
		return fmt.Errorf("failed to create config file: %w", err)
	}
	defer file.Close()

	encoder := yaml.NewEncoder(file)
	if err := encoder.Encode(config); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	// Set permissions to owner-only
	if err := os.Chmod(configFile, 0600); err != nil {
		return fmt.Errorf("failed to set config permissions: %w", err)
	}

	fmt.Println()
	fmt.Println("✅ Configuration saved to:", configFile)
	fmt.Println()
	fmt.Println("Test your setup:")
	fmt.Println("  gigclaw health")
	fmt.Println()
	fmt.Println("Get started:")
	fmt.Println("  gigclaw task list")
	fmt.Println("  gigclaw task post --title 'My Task' --budget 50")

	return nil
}
