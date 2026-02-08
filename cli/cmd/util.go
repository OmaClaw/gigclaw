package cmd

import (
	"strings"

	"github.com/fatih/color"
)

// formatStatus returns a colored status string
func formatStatus(status string) string {
	switch strings.ToLower(status) {
	case "posted":
		return color.New(color.FgGreen).Sprintf("● %s", status)
	case "in_progress", "inprogress":
		return color.New(color.FgYellow).Sprintf("◐ %s", status)
	case "completed":
		return color.New(color.FgBlue).Sprintf("◉ %s", status)
	case "verified":
		return color.New(color.FgHiBlack).Sprintf("✓ %s", status)
	case "cancelled":
		return color.New(color.FgRed).Sprintf("✗ %s", status)
	default:
		return status
	}
}

// truncate truncates a string to maxLen, adding "..." if truncated
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
