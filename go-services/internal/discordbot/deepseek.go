// Package discordbot is the Liquid Globe bot: a Discord gateway worker with one
// job and one command. /liquid takes a picture and re-makes it as an object in
// the RMH Studios design language — xAI reads the image and renders the liquid
// globe treatment (xai.go), DeepSeek writes the note explaining how the result
// obeys the language (this file), and canon.go is the single brief both are
// given.
//
// This file is the DeepSeek client. It talks to https://api.deepseek.com
// (OpenAI-compatible) with stdlib net/http rather than pulling in an SDK, and
// owns the reviewer prompt that turns a render into an adherence note.
package discordbot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DeepSeek's OpenAI-compatible base URL; the chat-completions path is appended.
const deepSeekBaseURL = "https://api.deepseek.com"

// Role constants for chat messages (OpenAI-compatible schema, shared with the
// xAI vision request in xai.go — both speak the same wire format).
const (
	roleSystem = "system"
	roleUser   = "user"
)

// ChatMessage is one turn in the OpenAI-compatible chat schema.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatCompletionRequest is the POST body for /chat/completions. We do not
// stream: a single blocking call is made and the embed rendered once.
type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Stream      bool          `json:"stream"`
	Temperature *float64      `json:"temperature,omitempty"`
}

// chatCompletionResponse is the (non-streamed) response shape. Shared with the
// xAI vision call, which returns the same OpenAI-compatible envelope.
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

// reviewTemperature keeps the note grounded. This is a design review, not
// creative writing — the facts it cites have to be the canon's, so it sits below
// DeepSeek's conversational default rather than above it.
const reviewTemperature = 0.6

func floatPtr(v float64) *float64 { return &v }

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

// configured reports whether the client can make calls (a key is set).
func (c *DeepSeekClient) configured() bool {
	return c != nil && c.apiKey != ""
}

// reviewerSystemPrompt casts DeepSeek as the design reviewer. The laws are
// supplied verbatim so the note cites the real contract rather than a
// plausible-sounding invention — the failure mode this prompt exists to prevent
// is a confident paragraph about tokens that do not exist.
func reviewerSystemPrompt() string {
	return `You are the design reviewer for RMH Studios. You are handed an object that has just been re-made in the house design language, and you write the short note that explains how it adheres to that language.

` + liquidGlobeLaws + `

HOW TO WRITE THE NOTE:
- Open with one sentence naming what the object was and what it has become.
- Then give exactly three bullets, each starting with a bolded short label followed by an em dash. Each bullet names ONE law above and says concretely how this object satisfies it. Pick the three laws the object actually exercises — do not always pick the same three.
- Close with one sentence on how the object degrades: what a visitor sees under high contrast, reduced transparency or reduced motion, given that the material is switched off centrally rather than per component.
- Under 180 words total. Discord markdown (** for bold) only — no headings, no code fences, no preamble, no sign-off.
- Cite only rules from the list above. Never invent a token name, a class name or a measurement. If the object exercises a law only weakly, say so plainly rather than overselling it.`
}

// Explain writes the adherence note for a rendered object. subject is what the
// uploaded picture was (stage 1's description); brief is the render brief the
// image model was actually given, so the reviewer is arguing about the object
// that exists rather than one it imagined. imageFailed marks the degraded path
// where the picture could not be generated, so the note describes the treatment
// the object WOULD receive instead of claiming to see it.
func (c *DeepSeekClient) Explain(ctx context.Context, subject, brief string, imageFailed bool) (string, error) {
	task := `Here is what the uploaded picture was:

` + strings.TrimSpace(subject) + `

Here is the brief the renderer was given for its liquid-globe treatment:

` + strings.TrimSpace(brief) + `

Write the adherence note for the resulting object.`

	if imageFailed {
		task += "\n\nNOTE: the render itself did not complete, so write the note about the treatment as specified — describe what the object is to become, not what you can see."
	}

	return c.chat(ctx, []ChatMessage{
		{Role: roleSystem, Content: reviewerSystemPrompt()},
		{Role: roleUser, Content: task},
	})
}

// chat issues a single non-streamed chat completion and returns the reply text.
func (c *DeepSeekClient) chat(ctx context.Context, messages []ChatMessage) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY is not set")
	}

	raw, err := json.Marshal(chatCompletionRequest{
		Model:       c.model,
		Messages:    messages,
		Stream:      false,
		Temperature: floatPtr(reviewTemperature),
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
		return "", fmt.Errorf("deepseek request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("deepseek HTTP %d: %s", resp.StatusCode, truncateHard(string(body), 300))
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
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}
