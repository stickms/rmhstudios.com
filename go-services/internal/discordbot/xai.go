// xai.go is the xAI (Grok) half of /liquid — the half that turns a picture into
// a liquid-globe object. It runs in two stages, both against api.x.ai with
// stdlib net/http (no SDK, matching the DeepSeek client next door):
//
//  1. READ (vision chat completion). The uploaded image goes to a multimodal
//     Grok model as an OpenAI-style image_url content part carrying a base64
//     data URI, and comes back as a compact prose description of what the thing
//     IS — subject, silhouette, composition, materials. This stage is what makes
//     /liquid a treatment OF your image rather than a random sphere.
//
//  2. RENDER (images.generations). That description is folded into the design
//     canon (canon.go) and generated as a monochrome glass object. The endpoint
//     is text-to-image, which is why stage 1 exists: the subject reaches the
//     renderer as words.
//
// Cost is bounded three ways: the shared image_gen_budget daily cap (the same
// row the bot-worker reserves against, so one ceiling covers both processes), a
// per-user cooldown enforced by the handler, and the cheap model by default
// (grok-imagine-image, $0.02/image).
//
// Both model IDs are env-overridable (XAI_IMAGE_MODEL / XAI_VISION_MODEL) so a
// retired default can be repointed by an operator without a deploy.
package discordbot

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
)

const (
	xaiBaseURL = "https://api.x.ai/v1"
	// grok-imagine-image is the cheap tier ($0.02/image);
	// grok-imagine-image-quality is $0.07. Default to cheap.
	defaultXAIImageModel  = "grok-imagine-image"
	defaultXAIVisionModel = "grok-4-fast-non-reasoning"
	// maxSourceBytes bounds the upload we will read and base64-encode into a
	// vision request. Discord's own limit is higher; this is our ceiling.
	maxSourceBytes = 8 << 20
	// maxRenderBytes bounds the generated image we download back.
	maxRenderBytes = 10 << 20
)

// sourceImage is a validated upload: the raw bytes plus the MIME type the data
// URI needs.
type sourceImage struct {
	Bytes    []byte
	MIME     string // "image/png", "image/jpeg", …
	Filename string
}

// renderedImage is a generated picture ready to attach to a Discord message.
type renderedImage struct {
	Bytes    []byte
	Filename string // always "liquid<ext>"
}

// xaiClient talks to both xAI endpoints the pipeline needs.
type xaiClient struct {
	apiKey      string
	imageModel  string
	visionModel string
	baseURL     string
	http        *http.Client
	budget      imageBudget
	logger      *log.Logger
}

func newXAIClient(apiKey, imageModel, visionModel string, budget imageBudget, logger *log.Logger) *xaiClient {
	if imageModel == "" {
		imageModel = defaultXAIImageModel
	}
	if visionModel == "" {
		visionModel = defaultXAIVisionModel
	}
	return &xaiClient{
		apiKey:      apiKey,
		imageModel:  imageModel,
		visionModel: visionModel,
		baseURL:     xaiBaseURL,
		http:        &http.Client{Timeout: 90 * time.Second},
		budget:      budget,
		logger:      logger,
	}
}

// configured reports whether a key is set and the image kill switch is off.
// XAI_IMAGE_ENABLED=false hard-disables generation across the fleet.
func (c *xaiClient) configured() bool {
	return c != nil && c.apiKey != "" && imageGenerationEnabled()
}

// ─── Stage 1: read the image ────────────────────────────────────────────

// visionSystemPrompt keeps stage 1 honest. It is a describer, not a critic and
// not a stylist — the styling is the canon's job, and a description that has
// already editorialised gives the renderer two conflicting briefs.
const visionSystemPrompt = `You describe images for a downstream text-to-image renderer.

Reply with ONE paragraph of plain prose, at most 90 words, covering in this order:
the subject (what the thing actually is), its silhouette and structure, how it is
composed in frame, and what it appears to be made of.

Be concrete and neutral. Do not evaluate the image, do not suggest a style, do not
mention art direction, and do not add a preamble — the paragraph itself is the whole
reply. If the image contains legible text, say what role the text plays (a label, a
sign, a screen) without transcribing it.`

// visionRequest is the OpenAI-compatible multimodal chat body. Content is a
// heterogeneous array, so each part is modelled explicitly rather than as a
// plain string.
type visionRequest struct {
	Model    string          `json:"model"`
	Messages []visionMessage `json:"messages"`
	Stream   bool            `json:"stream"`
}

type visionMessage struct {
	Role    string       `json:"role"`
	Content []visionPart `json:"content"`
}

type visionPart struct {
	Type     string         `json:"type"` // "text" | "image_url"
	Text     string         `json:"text,omitempty"`
	ImageURL *visionImageer `json:"image_url,omitempty"`
}

type visionImageer struct {
	URL    string `json:"url"` // data:<mime>;base64,<…>
	Detail string `json:"detail,omitempty"`
}

// Describe runs stage 1 and returns the subject description. notes, when the
// caller supplied any, is passed through as steering for the DESCRIBER only —
// it can bias what the description emphasises, never what the renderer's style
// is (that is fixed by the canon).
func (c *xaiClient) Describe(ctx context.Context, img *sourceImage, notes string) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("XAI_API_KEY is not set")
	}

	ask := "Describe this image."
	if n := strings.TrimSpace(notes); n != "" {
		ask += " The person who uploaded it asked that the description pay particular attention to: " + n
	}

	dataURI := "data:" + img.MIME + ";base64," + base64.StdEncoding.EncodeToString(img.Bytes)
	body, err := json.Marshal(visionRequest{
		Model:  c.visionModel,
		Stream: false,
		Messages: []visionMessage{
			{Role: roleSystem, Content: []visionPart{{Type: "text", Text: visionSystemPrompt}}},
			{Role: roleUser, Content: []visionPart{
				{Type: "image_url", ImageURL: &visionImageer{URL: dataURI, Detail: "high"}},
				{Type: "text", Text: ask},
			}},
		},
	})
	if err != nil {
		return "", fmt.Errorf("marshal vision request: %w", err)
	}

	raw, err := c.post(ctx, "/chat/completions", body, 1<<20)
	if err != nil {
		return "", err
	}

	var parsed chatCompletionResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("decode vision response: %w", err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("xai vision error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("xai vision returned no choices")
	}
	desc := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if desc == "" {
		return "", fmt.Errorf("xai vision returned an empty description")
	}
	return desc, nil
}

// ─── Stage 2: render the liquid object ──────────────────────────────────

// buildRenderPrompt folds the subject description into the design canon. The
// canon leads: the renderer is being told to make a liquid-globe artifact that
// happens to be OF this subject, not to restyle a photo.
func buildRenderPrompt(subject, notes string) string {
	var b strings.Builder
	b.WriteString(liquidGlobeVisual)
	b.WriteString("\n\nTHE SUBJECT TO RE-MAKE. Render the following as one liquid-globe artifact — its structure suspended inside the glass sphere as the ink wireframe, its silhouette readable through the body of the glass, everything about its own colours and materials discarded in favour of the monochrome glass above:\n")
	b.WriteString(strings.TrimSpace(subject))
	if n := strings.TrimSpace(notes); n != "" {
		b.WriteString("\n\nADDITIONAL DIRECTION FROM THE REQUESTER (subordinate to every rule above): ")
		b.WriteString(n)
	}
	return b.String()
}

// Render reserves a unit of the shared daily budget, generates the image and
// downloads the bytes back. Any failure is returned — the caller degrades to a
// text-only reply rather than pretending it worked.
func (c *xaiClient) Render(ctx context.Context, prompt string, now time.Time) (*renderedImage, error) {
	if !c.configured() {
		return nil, fmt.Errorf("image generation is not configured")
	}

	// Fail closed on both counts: unaccounted image spend is exactly what the
	// reservation exists to prevent.
	if c.budget == nil || !c.budget.available() {
		return nil, errBudgetUnavailable
	}
	ok, err := c.budget.reserve(ctx, now.UTC().Format("2006-01-02"), imageDailyCap())
	if err != nil {
		return nil, fmt.Errorf("image budget check failed: %w", err)
	}
	if !ok {
		return nil, errBudgetExhausted
	}

	url, err := c.requestImage(ctx, prompt)
	if err != nil {
		return nil, err
	}
	if url == "" {
		return nil, fmt.Errorf("xai returned no image")
	}

	raw, err := c.download(ctx, url)
	if err != nil {
		return nil, err
	}
	ext := detectImageExt(raw)
	if ext == "" {
		return nil, fmt.Errorf("xai returned unrecognized image bytes")
	}
	return &renderedImage{Bytes: raw, Filename: "liquid" + ext}, nil
}

// requestImage POSTs to images/generations and returns the first result URL.
func (c *xaiClient) requestImage(ctx context.Context, prompt string) (string, error) {
	body, err := json.Marshal(struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
		N      int    `json:"n"`
	}{Model: c.imageModel, Prompt: prompt, N: 1})
	if err != nil {
		return "", err
	}
	raw, err := c.post(ctx, "/images/generations", body, 1<<20)
	if err != nil {
		return "", err
	}
	var parsed struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("decode image response: %w", err)
	}
	if len(parsed.Data) == 0 {
		return "", nil
	}
	return parsed.Data[0].URL, nil
}

// post issues an authenticated JSON POST against the xAI base URL and returns
// the response body, capped at limit bytes.
func (c *xaiClient) post(ctx context.Context, path string, body []byte, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("xai request: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("xai HTTP %d: %s", resp.StatusCode, truncateHard(string(raw), 300))
	}
	return raw, nil
}

// download fetches the generated image bytes.
func (c *xaiClient) download(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("image download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("image download HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxRenderBytes))
}

// ─── Image sniffing ─────────────────────────────────────────────────────

// detectImageExt returns the file extension for a recognised image, or "" — the
// magic-byte check that keeps us from attaching an error page as a .png.
func detectImageExt(buf []byte) string {
	switch {
	case len(buf) >= 3 && buf[0] == 0xFF && buf[1] == 0xD8 && buf[2] == 0xFF:
		return ".jpg"
	case len(buf) >= 8 && bytes.Equal(buf[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}):
		return ".png"
	case len(buf) >= 4 && string(buf[:4]) == "GIF8":
		return ".gif"
	case len(buf) >= 12 && string(buf[:4]) == "RIFF" && string(buf[8:12]) == "WEBP":
		return ".webp"
	default:
		return ""
	}
}

// mimeForExt maps a sniffed extension back to the MIME type a data URI needs.
// Only the four types detectImageExt recognises can reach it.
func mimeForExt(ext string) string {
	switch ext {
	case ".jpg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return ""
	}
}
