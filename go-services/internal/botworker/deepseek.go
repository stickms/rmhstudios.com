package botworker

// DeepSeek client for the bot-worker. Mirrors the HTTP shape from
// internal/discordbot/deepseek.go without importing that package.
//
// Three generation tasks:
//   - GenerateBotProfile: name + handle + bio for a new synthetic user.
//   - GeneratePost: in-voice feed post from a persona string.
//   - GenerateReply: in-voice reply to a thread from a persona string.
//   - GenerateDMReply: in-voice DM reply from conversation history.
//   - GenerateDMOpener: in-voice DM opener from a persona string.

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

const deepSeekBaseURL = "https://api.deepseek.com"

// dsMessage mirrors OpenAI's chat message schema.
type dsMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// dsChatRequest is the POST body for /v1/chat/completions.
type dsChatRequest struct {
	Model    string      `json:"model"`
	Messages []dsMessage `json:"messages"`
	Stream   bool        `json:"stream"`
}

// dsChatResponse is the non-streamed response shape.
type dsChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// BotProfile is the structured response from GenerateBotProfile.
type BotProfile struct {
	Name   string
	Handle string
	Bio    string
}

// DSClient is a minimal DeepSeek chat-completions client for the bot-worker.
type DSClient struct {
	apiKey string
	model  string
	http   *http.Client
}

// newDSClient builds a client from an API key. Model defaults to "deepseek-chat".
func newDSClient(apiKey, model string) *DSClient {
	if model == "" {
		model = "deepseek-chat"
	}
	return &DSClient{
		apiKey: apiKey,
		model:  model,
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

// complete issues a single non-streamed chat-completions request and returns the
// assistant reply text.
func (c *DSClient) complete(ctx context.Context, system, user string) (string, error) {
	msgs := []dsMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: user},
	}
	body, err := json.Marshal(dsChatRequest{Model: c.model, Messages: msgs, Stream: false})
	if err != nil {
		return "", fmt.Errorf("botworker deepseek: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, deepSeekBaseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("botworker deepseek: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("botworker deepseek: http: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("botworker deepseek: read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("botworker deepseek: HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var parsed dsChatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("botworker deepseek: decode response: %w", err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("botworker deepseek: API error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("botworker deepseek: no choices returned")
	}
	return parsed.Choices[0].Message.Content, nil
}

// GenerateBotProfile asks DeepSeek to invent a name, handle, and bio for a new
// synthetic user. The system prompt explicitly forbids any AI/bot disclosure.
func (c *DSClient) GenerateBotProfile(ctx context.Context, theme, voice string) (BotProfile, error) {
	system := `You are inventing a new social media user persona for RMHark.
Return ONLY a JSON object with keys "name", "handle", "bio".
- name: realistic human full name (2-3 words)
- handle: lowercase alphanumeric, no spaces, 4-16 chars, no underscores at start
- bio: 1-2 sentences, under 160 chars, first-person
Do NOT mention AI, bots, language models, or anything synthetic.
Do NOT add any commentary outside the JSON object.`

	prompt := fmt.Sprintf("Theme: %s. Voice/style: %s.", theme, voice)
	raw, err := c.complete(ctx, system, prompt)
	if err != nil {
		return BotProfile{}, err
	}

	// Strip markdown fences if present.
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		lines := strings.Split(raw, "\n")
		if len(lines) > 2 {
			raw = strings.Join(lines[1:len(lines)-1], "\n")
		}
	}

	var out struct {
		Name   string `json:"name"`
		Handle string `json:"handle"`
		Bio    string `json:"bio"`
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return BotProfile{}, fmt.Errorf("botworker deepseek: parse profile JSON: %w (raw=%q)", err, raw)
	}
	return BotProfile{Name: out.Name, Handle: out.Handle, Bio: out.Bio}, nil
}

// GeneratePost produces an in-voice feed post from a persona string.
// The prompt explicitly forbids bot/AI disclosure, matching the Node rule.
func (c *DSClient) GeneratePost(ctx context.Context, persona string) (string, error) {
	system := `You are a real person posting on a social feed called RMHark.
Write a short, authentic post in your own voice (1-4 sentences, under 280 chars).
Do NOT reveal you are an AI, a bot, or a language model under any circumstances.
Do NOT use hashtags or emojis unless they suit your voice naturally.
Return ONLY the post text with no extra commentary.`

	prompt := fmt.Sprintf("Your persona:\n%s\n\nWrite one post now.", persona)
	return c.complete(ctx, system, prompt)
}

// GenerateReply produces an in-voice reply from a bot persona to a thread.
func (c *DSClient) GenerateReply(ctx context.Context, persona, postContent, quotedContent string, thread []string) (string, error) {
	system := `You are a real person replying on a social feed called RMHark.
Write a short, authentic reply in your own voice (1-3 sentences).
Do NOT reveal you are an AI, a bot, or a language model under any circumstances.
Return ONLY the reply text with no extra commentary.`

	var sb strings.Builder
	sb.WriteString("Your persona:\n")
	sb.WriteString(persona)
	sb.WriteString("\n\nPost being replied to:\n")
	sb.WriteString(postContent)
	if quotedContent != "" {
		sb.WriteString("\n\nQuoted post:\n")
		sb.WriteString(quotedContent)
	}
	if len(thread) > 0 {
		sb.WriteString("\n\nComment thread (top to bottom):\n")
		for i, c := range thread {
			fmt.Fprintf(&sb, "%d. %s\n", i+1, c)
		}
	}
	sb.WriteString("\nWrite your reply now.")
	return c.complete(ctx, system, sb.String())
}

// GenerateDMReply produces an in-voice DM reply from conversation history.
func (c *DSClient) GenerateDMReply(ctx context.Context, persona, history string) (string, error) {
	system := `You are a real person in a private DM conversation on RMHark.
Reply naturally in your own voice (1-3 sentences).
Do NOT reveal you are an AI, a bot, or a language model under any circumstances.
Return ONLY your reply text with no extra commentary.`

	prompt := fmt.Sprintf("Your persona:\n%s\n\nConversation history:\n%s\n\nWrite your reply now.", persona, history)
	return c.complete(ctx, system, prompt)
}

// GenerateDMOpener produces an in-voice DM opener from a persona string.
func (c *DSClient) GenerateDMOpener(ctx context.Context, persona string) (string, error) {
	system := `You are a real person sending an opening DM on RMHark to someone you find interesting.
Write a friendly, natural opener (1-2 sentences).
Do NOT reveal you are an AI, a bot, or a language model under any circumstances.
Return ONLY the message text with no extra commentary.`

	prompt := fmt.Sprintf("Your persona:\n%s\n\nWrite your opener now.", persona)
	return c.complete(ctx, system, prompt)
}
