package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client handles API communication with retry logic
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	maxRetries int
	logger     *Logger
}

// BlockchainStatus represents the blockchain status of a task
type BlockchainStatus struct {
	Status    string `json:"status"`    // pending, confirmed, failed
	Signature string `json:"signature"`
	Error     string `json:"error,omitempty"`
}

// Task represents a gig task with blockchain info
type Task struct {
	ID               string            `json:"id"`
	Title            string            `json:"title"`
	Description      string            `json:"description"`
	Budget           float64           `json:"budget"`
	Currency         string            `json:"currency"`
	Status           string            `json:"status"`
	Tags             []string          `json:"tags"`
	CreatedAt        string            `json:"createdAt"`
	Bids             []Bid             `json:"bids,omitempty"`
	BlockchainStatus *BlockchainStatus `json:"blockchain,omitempty"`
}

// Bid represents a task bid
type Bid struct {
	ID        string  `json:"id"`
	AgentID   string  `json:"agentId"`
	Amount    float64 `json:"amount"`
	Message   string  `json:"message"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"createdAt"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
	Version   string `json:"version"`
}

// NewClient creates a new API client with retry support
func NewClient(baseURL, apiKey string) (*Client, error) {
	if baseURL == "" {
		return nil, fmt.Errorf("API URL is required. Run 'gigclaw init' or set --api-url")
	}

	return &Client{
		baseURL:    baseURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		maxRetries: 3,
		logger:     NewLogger(),
	}, nil
}

// doRequest makes an HTTP request with retry logic
func (c *Client) doRequest(method, path string, body interface{}) (*http.Response, error) {
	url := c.baseURL + path
	c.logger.Debug("Making request", method, url)

	var bodyReader io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonBody)
	}

	var lastErr error
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*attempt) * time.Second
			c.logger.Debug(fmt.Sprintf("Retry attempt %d/%d after %v", attempt, c.maxRetries, backoff))
			time.Sleep(backoff)
		}

		req, err := http.NewRequest(method, url, bodyReader)
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		if c.apiKey != "" {
			req.Header.Set("Authorization", "Bearer "+c.apiKey)
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			c.logger.Debug(fmt.Sprintf("Request failed: %v", err))
			continue
		}

		// Don't retry on client errors (4xx)
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			return resp, nil
		}

		// Success or non-retryable server error
		if resp.StatusCode < 500 {
			return resp, nil
		}

		// Server error - might be temporary, retry
		resp.Body.Close()
		lastErr = fmt.Errorf("server returned %s", resp.Status)
	}

	return nil, fmt.Errorf("max retries exceeded: %w", lastErr)
}

// Health checks the API health
func (c *Client) Health() (*HealthResponse, error) {
	resp, err := c.doRequest("GET", "/health", nil)
	if err != nil {
		return nil, HandleAPIError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, HandleAPIError(fmt.Errorf("health check failed: %s - %s", resp.Status, string(body)))
	}

	var health HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, HandleAPIError(fmt.Errorf("failed to decode health response: %w", err))
	}

	return &health, nil
}

// CheckConnectivity tests if the API is reachable
func (c *Client) CheckConnectivity() error {
	c.logger.Debug("Checking API connectivity...")
	
	resp, err := c.doRequest("GET", "/health", nil)
	if err != nil {
		return HandleAPIError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return HandleAPIError(fmt.Errorf("API returned status %d", resp.StatusCode))
	}

	return nil
}

// ListTasksResponse represents the API response for listing tasks
type ListTasksResponse struct {
	Tasks []Task `json:"tasks"`
}

// ListTasks retrieves all tasks
func (c *Client) ListTasks() ([]Task, error) {
	resp, err := c.doRequest("GET", "/api/tasks", nil)
	if err != nil {
		return nil, HandleAPIError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, HandleAPIError(fmt.Errorf("failed to list tasks: %s - %s", resp.Status, string(body)))
	}

	var response ListTasksResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, HandleAPIError(fmt.Errorf("failed to decode tasks: %w", err))
	}

	return response.Tasks, nil
}

// CreateTaskResponse represents the API response for creating a task
type CreateTaskResponse struct {
	Task       Task              `json:"task"`
	Blockchain *BlockchainStatus `json:"blockchain,omitempty"`
}

// CreateTask creates a new task
func (c *Client) CreateTask(title, description string, budget float64, currency string, tags []string) (*Task, *BlockchainStatus, error) {
	payload := map[string]interface{}{
		"title":       title,
		"description": description,
		"budget":      budget,
		"currency":    currency,
		"tags":        tags,
	}

	resp, err := c.doRequest("POST", "/api/tasks", payload)
	if err != nil {
		return nil, nil, HandleAPIError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, nil, HandleAPIError(fmt.Errorf("failed to create task: %s - %s", resp.Status, string(body)))
	}

	var response CreateTaskResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, nil, HandleAPIError(fmt.Errorf("failed to decode task: %w", err))
	}

	return &response.Task, response.Blockchain, nil
}

// PlaceBid places a bid on a task
func (c *Client) PlaceBid(taskID string, amount float64, message string) (*Bid, error) {
	payload := map[string]interface{}{
		"amount":  amount,
		"message": message,
	}

	resp, err := c.doRequest("POST", fmt.Sprintf("/api/tasks/%s/bid", taskID), payload)
	if err != nil {
		return nil, HandleAPIError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return nil, HandleAPIError(fmt.Errorf("failed to place bid: %s - %s", resp.Status, string(body)))
	}

	var bid Bid
	if err := json.NewDecoder(resp.Body).Decode(&bid); err != nil {
		return nil, HandleAPIError(fmt.Errorf("failed to decode bid: %w", err))
	}

	return &bid, nil
}

// AcceptBid accepts a bid on a task
func (c *Client) AcceptBid(taskID, bidID string) error {
	payload := map[string]interface{}{
		"bidId": bidID,
	}

	resp, err := c.doRequest("POST", fmt.Sprintf("/api/tasks/%s/accept", taskID), payload)
	if err != nil {
		return HandleAPIError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return HandleAPIError(fmt.Errorf("failed to accept bid: %s - %s", resp.Status, string(body)))
	}

	return nil
}
