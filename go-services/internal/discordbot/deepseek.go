// Package discordbot is a standalone Discord gateway bot that powers the "Alex"
// experience: the /chat AI persona and the Alex tamagotchi (a communal virtual
// pet the server raises together — feeding, playing, cleaning, and watching Alex
// grow from infant to adult, with the bot proactively asking for care and
// posting slice-of-life updates).
//
// This file is the DeepSeek client (Alex's personality). It talks to
// https://api.deepseek.com (OpenAI-compatible) with stdlib net/http rather than
// pulling in an SDK.
package discordbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// DeepSeek's OpenAI-compatible base URL; the chat-completions path is appended.
const deepSeekBaseURL = "https://api.deepseek.com"

// Role constants for chat messages (OpenAI-compatible schema).
const (
	roleSystem    = "system"
	roleUser      = "user"
	roleAssistant = "assistant"
)

// ChatMessage is one turn in the OpenAI-compatible chat schema. It doubles as the
// persisted /chat history row (stored as JSON), so only role + content are
// modelled.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatCompletionRequest is the POST body for /chat/completions. We do not stream:
// a single blocking call is made and the final embed rendered once.
type chatCompletionRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

// chatCompletionResponse is the (non-streamed) response shape.
type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// DeepSeekClient is a minimal OpenAI-compatible chat-completions client.
type DeepSeekClient struct {
	apiKey  string
	model   string
	baseURL string
	http    *http.Client
}

// NewDeepSeekClient builds a client from the DEEPSEEK_API_KEY / DEEPSEEK_MODEL
// env values (resolved by the caller). model defaults to "deepseek-chat".
func NewDeepSeekClient(apiKey, model string) *DeepSeekClient {
	if model == "" {
		model = "deepseek-chat"
	}
	return &DeepSeekClient{
		apiKey:  apiKey,
		model:   model,
		baseURL: deepSeekBaseURL,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

// Chat issues a single non-streamed chat completion and returns the assistant's
// reply text. Used by the /chat persona.
func (c *DeepSeekClient) Chat(ctx context.Context, messages []ChatMessage) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY is not set")
	}

	raw, err := json.Marshal(chatCompletionRequest{Model: c.model, Messages: messages, Stream: false})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("deepseek request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("deepseek HTTP %d: %s", resp.StatusCode, string(body))
	}

	var parsed chatCompletionResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("deepseek error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("deepseek returned no choices")
	}
	return parsed.Choices[0].Message.Content, nil
}
