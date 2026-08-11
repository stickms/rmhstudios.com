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
	"strconv"
	"strings"
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
// a single blocking call is made and the final embed rendered once. The sampling
// knobs are pointers so an unset one is omitted from the JSON (DeepSeek then uses
// its own default) — see ChatOptions.
type chatCompletionRequest struct {
	Model            string        `json:"model"`
	Messages         []ChatMessage `json:"messages"`
	Stream           bool          `json:"stream"`
	Temperature      *float64      `json:"temperature,omitempty"`
	PresencePenalty  *float64      `json:"presence_penalty,omitempty"`
	FrequencyPenalty *float64      `json:"frequency_penalty,omitempty"`
}

// ChatOptions tunes the sampling for one completion. All fields are optional;
// a nil Temperature falls back to conversationalTemperature (a bit above the
// model's default) so Alex reads less robotic even on a plain reply. The
// proactive-quip path passes a higher temperature plus repetition penalties so
// his ambient posts stop collapsing onto the same handful of boba jokes.
type ChatOptions struct {
	Temperature      *float64
	PresencePenalty  *float64
	FrequencyPenalty *float64
}

// conversationalTemperature is DeepSeek's recommended setting for general
// conversation (their guidance: ~1.3 for chat, ~1.5 for creative writing). The
// API otherwise defaults to 1.0, which makes Alex noticeably repetitive.
const conversationalTemperature = 1.3

// floatPtr is a tiny helper for building the optional sampling pointers.
func floatPtr(v float64) *float64 { return &v }

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
//
// Every call goes through the package retry loop (retry.go). DeepSeek rate-limits
// aggressively and, like every hosted inference API, occasionally answers 5xx or
// simply drops the connection; before this, a single one of those lost whatever
// was being generated — Alex's reply, or a day's summary that then waited a full
// half-hour pass to be attempted again.
type DeepSeekClient struct {
	apiKey  string
	model   string
	baseURL string
	http    *http.Client
	// logger is only used to narrate retries; nil is fine and silent.
	logger retryLogger
}

// WithLogger attaches a logger for retry narration. Returns the same client so
// it can be chained onto the constructor at a call site that has one.
func (c *DeepSeekClient) WithLogger(l retryLogger) *DeepSeekClient {
	if c != nil {
		c.logger = l
	}
	return c
}

// configured reports whether the client can make calls (a key is set).
func (c *DeepSeekClient) configured() bool {
	return c != nil && c.apiKey != ""
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
// reply text, using the conversational sampling defaults. Used by the /chat
// persona and @mention replies.
func (c *DeepSeekClient) Chat(ctx context.Context, messages []ChatMessage) (string, error) {
	return c.ChatWith(ctx, messages, ChatOptions{})
}

// ChatWith is Chat with explicit sampling controls, so callers that want more
// variety (Alex's proactive quips) can crank the temperature and add repetition
// penalties. A nil Temperature defaults to conversationalTemperature.
func (c *DeepSeekClient) ChatWith(ctx context.Context, messages []ChatMessage, opts ChatOptions) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY is not set")
	}
	var reply string
	err := withRetry(ctx, c.logger, "deepseek.chat", retryAPI, func(ctx context.Context) error {
		var err error
		reply, err = c.chatOnce(ctx, messages, opts)
		return err
	})
	return reply, err
}

// chatOnce is a single attempt. Split out so the retry loop above reads as the
// policy and this reads as the request.
func (c *DeepSeekClient) chatOnce(ctx context.Context, messages []ChatMessage, opts ChatOptions) (string, error) {

	temp := opts.Temperature
	if temp == nil {
		temp = floatPtr(conversationalTemperature)
	}
	raw, err := json.Marshal(chatCompletionRequest{
		Model:            c.model,
		Messages:         messages,
		Stream:           false,
		Temperature:      temp,
		PresencePenalty:  opts.PresencePenalty,
		FrequencyPenalty: opts.FrequencyPenalty,
	})
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
		// A transport error is the most retryable thing there is: the request
		// either never arrived or its answer did not.
		return "", fmt.Errorf("deepseek request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		httpErr := fmt.Errorf("deepseek HTTP %d: %s", resp.StatusCode, truncateRunes(string(body), 300))
		if !retryableStatus(resp.StatusCode) {
			// 400/401/403/404 answer identically every time. Retrying a bad key
			// four times is four ways to be told the same thing.
			return "", permanent(httpErr)
		}
		if wait := parseRetryAfter(resp.Header.Get("Retry-After")); wait > 0 {
			return "", retryAfter(httpErr, wait)
		}
		return "", httpErr
	}

	var parsed chatCompletionResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		// A 200 that is not JSON is usually a proxy or an interstitial in the
		// path rather than DeepSeek itself, and that clears.
		return "", fmt.Errorf("decode response: %w", err)
	}
	if parsed.Error != nil {
		return "", permanent(fmt.Errorf("deepseek error: %s", parsed.Error.Message))
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("deepseek returned no choices")
	}
	return parsed.Choices[0].Message.Content, nil
}

// retryableStatus reports whether an HTTP status is worth trying again.
//
// 429 and 5xx are the transient ones. 408 (request timeout) and 409 (conflict)
// are included because DeepSeek uses both for load shedding. Everything else in
// 4xx is a statement about the request, which the next attempt would repeat.
func retryableStatus(code int) bool {
	switch code {
	case http.StatusRequestTimeout, http.StatusConflict, http.StatusTooManyRequests:
		return true
	}
	return code >= 500
}

// parseRetryAfter reads the header in either of its two legal forms — a count of
// seconds, or an HTTP date. Zero when absent or unparseable, which leaves the
// backoff schedule in charge.
func parseRetryAfter(value string) time.Duration {
	if value == "" {
		return 0
	}
	if secs, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
		if secs < 0 {
			return 0
		}
		return time.Duration(secs) * time.Second
	}
	if when, err := http.ParseTime(value); err == nil {
		if d := time.Until(when); d > 0 {
			return d
		}
	}
	return 0
}
