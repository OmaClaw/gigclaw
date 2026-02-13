package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/fatih/color"
)

// Logger provides structured logging for the CLI
type Logger struct {
	verbose bool
}

// NewLogger creates a new logger
func NewLogger() *Logger {
	return &Logger{
		verbose: os.Getenv("GIGCLAW_DEBUG") == "true",
	}
}

// Debug logs debug messages (only shown with GIGCLAW_DEBUG=true)
func (l *Logger) Debug(msg string, fields ...interface{}) {
	if l.verbose {
		timestamp := time.Now().Format("15:04:05")
		color.New(color.FgHiBlack).Printf("[DEBUG %s] %s", timestamp, msg)
		if len(fields) > 0 {
			fmt.Printf(" %v", fields)
		}
		fmt.Println()
	}
}

// Info logs informational messages
func (l *Logger) Info(msg string) {
	color.New(color.FgCyan).Printf("ℹ  %s\n", msg)
}

// Success logs success messages
func (l *Logger) Success(msg string) {
	color.New(color.FgGreen, color.Bold).Printf("✓ %s\n", msg)
}

// Warning logs warning messages
func (l *Logger) Warning(msg string) {
	color.New(color.FgYellow).Printf("⚠  %s\n", msg)
}

// Error logs error messages with context
func (l *Logger) Error(msg string, err error) {
	color.New(color.FgRed, color.Bold).Printf("✗ %s\n", msg)
	if err != nil && l.verbose {
		color.New(color.FgRed).Printf("   Error: %v\n", err)
	}
}

// Fatal logs error and exits
func (l *Logger) Fatal(msg string, err error) {
	l.Error(msg, err)
	os.Exit(1)
}

// APIError represents a structured API error
type APIError struct {
	StatusCode int
	Message    string
	Suggestion string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("API error %d: %s", e.StatusCode, e.Message)
}

// HandleAPIError provides user-friendly error messages with suggestions
func HandleAPIError(err error) error {
	if err == nil {
		return nil
	}

	// Check if it's a network error
	if os.IsTimeout(err) {
		return fmt.Errorf(`%s API request timed out

%s
  • Check your internet connection
  • The API might be temporarily unavailable
  • Try again in a few moments`,
			color.RedString("✗"),
			color.YellowString("Suggestions:"))
	}

	// Handle specific error patterns
	errStr := err.Error()
	
	switch {
	case contains(errStr, "connection refused"):
		return fmt.Errorf(`%s Cannot connect to GigClaw API

%s
  • Check if the API URL is correct: gigclaw config
  • The service might be down
  • Try: gigclaw health

%s https://gigclaw-production.up.railway.app/health`,
			color.RedString("✗"),
			color.YellowString("Suggestions:"),
			color.CyanString("Status page:"))

	case contains(errStr, "404"):
		return fmt.Errorf(`%s Resource not found

%s
  • The task or bid ID might be incorrect
  • Check available tasks: gigclaw task list
  • The resource may have been deleted`,
			color.RedString("✗"),
			color.YellowString("Suggestions:"))

	case contains(errStr, "401"), contains(errStr, "403"):
		return fmt.Errorf(`%s Authentication failed

%s
  • Check your API key: gigclaw config
  • You may need to run: gigclaw init
  • Contact support if the issue persists`,
			color.RedString("✗"),
			color.YellowString("Suggestions:"))

	case contains(errStr, "400"):
		return fmt.Errorf(`%s Invalid request

%s
  • Check your command arguments
  • Verify required flags are provided
  • Run with --help for usage info`,
			color.RedString("✗"),
			color.YellowString("Suggestions:"))

	case contains(errStr, "500"), contains(errStr, "502"), contains(errStr, "503"):
		return fmt.Errorf(`%s API server error

%s
  • The server encountered an error
  • This is temporary - please try again
  • Check status: https://gigclaw-production.up.railway.app/health`,
			color.RedString("✗"),
			color.YellowString("Suggestions:"))

	default:
		return fmt.Errorf(`%s %s

%s
  • Run with GIGCLAW_DEBUG=true for details
  • Check your configuration: gigclaw config
  • Try: gigclaw health`,
			color.RedString("✗"),
			errStr,
			color.YellowString("Suggestions:"))
	}
}

func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && (s == substr || len(s) > len(substr) && (s[:len(substr)] == substr || s[len(s)-len(substr):] == substr || findSubstr(s, substr)))
}

func findSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Global logger instance
var logger = NewLogger()
