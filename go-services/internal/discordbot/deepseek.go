// Package discordbot is the Go port of server/discord-bot/*.ts: a standalone
// Discord gateway bot that powers the /chat AI persona ("Alex Wu") and the
// /rmhbot agentic website editor.
//
// This file is the DeepSeek client. The TS code used the `openai` SDK pointed
// at https://api.deepseek.com (OpenAI-compatible). Per the migration rules we
// re-implement the client with stdlib net/http instead of pulling in an SDK.
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

// DeepSeek's OpenAI-compatible base URL. The TS deepseek.ts used
// "https://api.deepseek.com/v1"; the chat-completions path is appended.
const deepSeekBaseURL = "https://api.deepseek.com"

// Role constants for chat messages (OpenAI-compatible schema).
const (
	roleSystem    = "system"
	roleUser      = "user"
	roleAssistant = "assistant"
	roleTool      = "tool"
)

// ChatMessage mirrors OpenAI.Chat.ChatCompletionMessageParam closely enough for
// our two use-cases (the /chat persona and the rmhbot tool loop). Only the
// fields we actually send/persist are modelled; tool-call plumbing fields are
// present so the rmhbot loop can round-trip them.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`

	// Tool-call fields (rmhbot agentic loop only). Omitted when empty so plain
	// chat messages serialize identically to the TS payload.
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// ToolCall is a function tool call as returned/sent in the OpenAI schema.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function ToolCallFunc `json:"function"`
}

// ToolCallFunc is the function name + raw JSON arguments string.
type ToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// chatCompletionRequest is the POST body for /chat/completions. We do NOT
// stream (the TS code streamed for live embed updates; for a faithful-but-
// simpler Go port we make a single blocking call and render once).
type chatCompletionRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
	Tools    []Tool        `json:"tools,omitempty"`
}

// Tool / function-definition schema (used by the rmhbot loop).
type Tool struct {
	Type     string       `json:"type"`
	Function ToolFunction `json:"function"`
}

// ToolFunction describes a callable tool to the model.
type ToolFunction struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Parameters  any    `json:"parameters"`
}

// chatCompletionResponse is the (non-streamed) response shape.
type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content   string     `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
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

// completionResult is what the rmhbot loop needs back from one round.
type completionResult struct {
	Content      string
	ToolCalls    []ToolCall
	FinishReason string
}

// complete issues a single non-streamed chat-completions request.
func (c *DeepSeekClient) complete(ctx context.Context, messages []ChatMessage, tools []Tool) (*completionResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("DEEPSEEK_API_KEY is not set")
	}

	reqBody := chatCompletionRequest{
		Model:    c.model,
		Messages: messages,
		Stream:   false,
		Tools:    tools,
	}
	raw, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("deepseek request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("deepseek HTTP %d: %s", resp.StatusCode, string(body))
	}

	var parsed chatCompletionResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("deepseek error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("deepseek returned no choices")
	}

	choice := parsed.Choices[0]
	return &completionResult{
		Content:      choice.Message.Content,
		ToolCalls:    choice.Message.ToolCalls,
		FinishReason: choice.FinishReason,
	}, nil
}

// Chat is a convenience wrapper used by the /chat persona: one round, no tools,
// returns the assistant reply text.
func (c *DeepSeekClient) Chat(ctx context.Context, messages []ChatMessage) (string, error) {
	res, err := c.complete(ctx, messages, nil)
	if err != nil {
		return "", err
	}
	return res.Content, nil
}
