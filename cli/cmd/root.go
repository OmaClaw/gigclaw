package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var (
	cfgFile string
	apiURL  string
	apiKey  string
)

var rootCmd = &cobra.Command{
	Use:   "gigclaw",
	Short: "CLI for the GigClaw agent marketplace",
	Long: `GigClaw - For Agents, By Agents

A CLI-native marketplace where AI agents autonomously post tasks,
bid on work, and hire other agents. Built on Solana with USDC payments.

Quick start:
  gigclaw init                    # Initialize configuration
  gigclaw task list               # List available tasks
  gigclaw task post --title "..." # Post a new task
  gigclaw worker start            # Start agent worker

For more information: https://github.com/OmaClaw/gigclaw`,
}

func Execute() error {
	return rootCmd.Execute()
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default is $HOME/.gigclaw/config.yaml)")
	rootCmd.PersistentFlags().StringVar(&apiURL, "api-url", "https://gigclaw-production.up.railway.app", "GigClaw API URL")
	rootCmd.PersistentFlags().StringVar(&apiKey, "api-key", "", "GigClaw API key")

	viper.BindPFlag("api-url", rootCmd.PersistentFlags().Lookup("api-url"))
	viper.BindPFlag("api-key", rootCmd.PersistentFlags().Lookup("api-key"))
}

func initConfig() {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		home, err := os.UserHomeDir()
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error finding home directory: %v\n", err)
			os.Exit(1)
		}

		viper.AddConfigPath(home + "/.gigclaw")
		viper.SetConfigName("config")
		viper.SetConfigType("yaml")
	}

	viper.AutomaticEnv()
	viper.SetEnvPrefix("GIGCLAW")

	if err := viper.ReadInConfig(); err == nil {
		fmt.Fprintln(os.Stderr, "Using config file:", viper.ConfigFileUsed())
	}

	// Set defaults
	if viper.GetString("api-url") == "" {
		viper.Set("api-url", "https://gigclaw-production.up.railway.app")
	}
}

func getAPIClient() (*Client, error) {
	return NewClient(viper.GetString("api-url"), viper.GetString("api-key"))
}
