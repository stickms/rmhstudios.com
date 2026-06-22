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

// replySystemPrompt builds the in-character reply system prompt. The
// "never reveal you are a bot" rule is enforced here. Extracted so it is
// unit-testable without a network call.
func replySystemPrompt(persona string) string {
	return strings.Join([]string{
		"You are roleplaying as a specific person replying on a social feed called RMHark. Stay completely in character.",
		"Never reveal or hint that you are an AI, a bot, or generated. You are just a person.",
		"Follow this persona exactly, including the VOICE rules (formality, quirks, and any typos):",
		"",
		persona,
		"",
		"Be relevant and add something — agree, riff, ask, or gently push back. Sound human.",
		"Do NOT use markdown, do NOT wrap the reply in quotes, do NOT add a label. Output ONLY the reply text.",
	}, "\n")
}

// assembleReplyContext builds the user message that gives the model the post,
// any quoted post, and the ancestor thread. Pure (no disclosure language).
func assembleReplyContext(postContent, quotedContent string, thread []string) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("The original post says:\n\"\"\"%s\"\"\"", strings.TrimSpace(postContent)))
	if q := strings.TrimSpace(quotedContent); q != "" {
		parts = append(parts, fmt.Sprintf("\nThat post is quoting this earlier post:\n\"\"\"%s\"\"\"", q))
	}
	var clean []string
	for _, c := range thread {
		if t := strings.TrimSpace(c); t != "" {
			clean = append(clean, t)
		}
	}
	if len(clean) > 0 {
		var sb strings.Builder
		sb.WriteString("\nThe reply thread so far (oldest first), and you are replying to the LAST one:\n")
		for i, c := range clean {
			fmt.Fprintf(&sb, "%d. \"%s\"\n", i+1, c)
		}
		parts = append(parts, sb.String())
	}
	parts = append(parts, "\nWrite the reply.")
	return strings.Join(parts, "\n")
}

// GenerateReply produces an in-voice reply from a bot persona to a thread.
func (c *DSClient) GenerateReply(ctx context.Context, persona, postContent, quotedContent string, thread []string) (string, error) {
	return c.complete(ctx, replySystemPrompt(persona), assembleReplyContext(postContent, quotedContent, thread))
}

// dmSystemPrompt builds the in-character DM system prompt. The
// "never reveal you are a bot" rule is enforced here.
func dmSystemPrompt(persona string) string {
	return strings.Join([]string{
		"You are roleplaying as a specific person chatting in private DMs. Stay completely in character.",
		"Never reveal or hint that you are an AI, a bot, or generated. You are just a person.",
		"Follow this persona exactly, including the VOICE rules (formality, quirks, and any typos):",
		"",
		persona,
		"",
		"This is a private one-to-one direct message (DM), not a public post.",
		"Write like a real person messaging privately: warm, specific, conversational. You may ask a question back.",
		"Do NOT use markdown, do NOT wrap the message in quotes, do NOT add a label. Output ONLY the message text.",
	}, "\n")
}

// assembleDMTranscript renders the DM history labeled them/you for the model.
func assembleDMTranscript(turns []dmTurn) string {
	if len(turns) == 0 {
		return "(no messages yet)"
	}
	var sb strings.Builder
	for i, t := range turns {
		who := "Them"
		if t.From == "you" {
			who = "You"
		}
		if i > 0 {
			sb.WriteString("\n")
		}
		fmt.Fprintf(&sb, "%s: %s", who, t.Text)
	}
	return sb.String()
}

// GenerateDMReply produces an in-voice DM reply from conversation history.
func (c *DSClient) GenerateDMReply(ctx context.Context, persona string, history []dmTurn) (string, error) {
	user := strings.Join([]string{
		"Here is your DM conversation so far (oldest first):",
		assembleDMTranscript(history),
		"",
		"Write your next message as the most recent reply. Output only the message.",
	}, "\n")
	return c.complete(ctx, dmSystemPrompt(persona), user)
}

// GenerateDMOpener produces an in-voice DM opener from a persona string.
func (c *DSClient) GenerateDMOpener(ctx context.Context, persona string) (string, error) {
	user := strings.Join([]string{
		"Start a new private conversation with someone on the same social platform.",
		"Open naturally and briefly — a friendly hello, a small question, or a light comment in your voice.",
		"Output only the message.",
	}, "\n")
	return c.complete(ctx, dmSystemPrompt(persona), user)
}

// GenerateImagePrompt turns a finished post into a concise text-to-image prompt.
// Mirrors lib/rmhark-ai/generate.server.ts generateImagePrompt.
func (c *DSClient) GenerateImagePrompt(ctx context.Context, postText string) (string, error) {
	text := strings.TrimSpace(postText)
	if len(text) > 600 {
		text = text[:600]
	}
	system := strings.Join([]string{
		"You turn a short social-media post into a prompt for a text-to-image model.",
		"Output ONE vivid, literal visual description of a single image that fits the post.",
		"Rules: under 40 words. Describe the subject, setting, style, and mood.",
		"Do NOT put any text or words in the image. Do NOT depict real, named people, celebrities, brands, or logos.",
		"Keep it safe-for-work and non-violent.",
		"Output ONLY the image prompt — no quotes, no labels, no markdown.",
	}, "\n")
	user := "Write a tasteful, interesting image prompt for a generic lifestyle social post."
	if text != "" {
		user = fmt.Sprintf("Post:\n\"\"\"%s\"\"\"\n\nWrite the image prompt.", text)
	}
	return c.complete(ctx, system, user)
}
