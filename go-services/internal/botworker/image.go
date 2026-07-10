package botworker

// image.go — AI image generation for bot posts, ported from
// lib/rmhark-ai/image.server.ts + image-budget.server.ts + lib/storage/keys.ts.
//
// Flow: post text -> DeepSeek visual prompt -> xAI images.generate -> download
// the bytes -> validate magic bytes -> host into feed storage -> return a feed
// image URL. Returns ("", false) on ANY failure so a failed image can never
// block a post (mirrors the Node "returns null on any failure" contract).
//
// Budget table: ImageGenBudget @@map("image_gen_budget"); columns: day (PK), count.
// Storage backends (S3 + local fallback) live in storage.go.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	xaiBaseURL          = "https://api.x.ai/v1"
	defaultXAIModel     = "grok-imagine-image"
	defaultImageDailyCap = 50
	feedImagePrefix     = "rmharks/"
)

// budgetReserver is the DB surface the image path needs to reserve daily budget.
type budgetReserver interface {
	// ReserveImageBudget atomically reserves one unit of today's global budget.
	// Returns true iff under cap. Fails closed (false, err) on any DB error.
	ReserveImageBudget(ctx context.Context, day string, capLimit int) (bool, error)
}

// imageGenerator turns post text into a hosted feed image URL.
type imageGenerator struct {
	ds      *DSClient // for the visual prompt
	apiKey  string    // XAI_API_KEY
	model   string    // XAI_IMAGE_MODEL
	budget  budgetReserver
	http    *http.Client
}

func newImageGenerator(ds *DSClient, budget budgetReserver) *imageGenerator {
	model := os.Getenv("XAI_IMAGE_MODEL")
	if model == "" {
		model = defaultXAIModel
	}
	return &imageGenerator{
		ds:     ds,
		apiKey: os.Getenv("XAI_API_KEY"),
		model:  model,
		budget: budget,
		http:   &http.Client{Timeout: 60 * time.Second},
	}
}

// isImageGenConfigured reports whether a key is set and the kill switch is not
// engaged. Mirrors Node isImageGenConfigured().
func isImageGenConfigured() bool {
	return os.Getenv("XAI_API_KEY") != "" && os.Getenv("XAI_IMAGE_ENABLED") != "false"
}

// imageDailyCap resolves the global daily cap (env XAI_IMAGE_DAILY_CAP, else 50).
func imageDailyCap() int {
	raw := os.Getenv("XAI_IMAGE_DAILY_CAP")
	if n, err := strconv.Atoi(raw); err == nil && n > 0 {
		return n
	}
	return defaultImageDailyCap
}

// todayKey returns the UTC day key, e.g. "2026-06-22".
func todayKey() string {
	return time.Now().UTC().Format("2006-01-02")
}

// generatePostImage generates an image for a post and returns a feed image URL,
// or ("", false) on any failure. Mirrors Node generatePostImage().
func (g *imageGenerator) generatePostImage(ctx context.Context, text, userID string) (string, bool) {
	if !isImageGenConfigured() {
		return "", false
	}

	prompt, err := g.ds.GenerateImagePrompt(ctx, text)
	if err != nil || strings.TrimSpace(prompt) == "" {
		return "", false
	}

	// Reserve budget right before the paid call (not refunded if it fails).
	ok, err := g.budget.ReserveImageBudget(ctx, todayKey(), imageDailyCap())
	if err != nil || !ok {
		return "", false
	}

	imgURL, err := g.requestImage(ctx, prompt)
	if err != nil || imgURL == "" {
		return "", false
	}

	buf, err := g.download(ctx, imgURL)
	if err != nil || len(buf) == 0 {
		return "", false
	}

	if !validateImageBuffer(buf) {
		return "", false
	}
	ext := detectImageExt(buf)
	if ext == "" {
		return "", false
	}

	filename := fmt.Sprintf("%s-%d-%d%s", userID, time.Now().UnixMilli(), rand.Intn(1e9), ext)
	if err := putObject(feedImageKey(filename), buf, contentTypeForFilename(filename)); err != nil {
		return "", false
	}
	return feedImageURL(filename), true
}

// requestImage calls the xAI images.generate endpoint and returns the first URL.
func (g *imageGenerator) requestImage(ctx context.Context, prompt string) (string, error) {
	body, err := json.Marshal(struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
		N      int    `json:"n"`
	}{Model: g.model, Prompt: prompt, N: 1})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, xaiBaseURL+"/images/generations", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+g.apiKey)

	resp, err := g.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("xai HTTP %d: %s", resp.StatusCode, string(raw))
	}
	var parsed struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", err
	}
	if len(parsed.Data) == 0 {
		return "", nil
	}
	return parsed.Data[0].URL, nil
}

// download fetches the generated image bytes.
func (g *imageGenerator) download(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := g.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download HTTP %d", resp.StatusCode)
	}
	// Cap at 10 MB to bound memory.
	return io.ReadAll(io.LimitReader(resp.Body, 10<<20))
}

// ─── Storage helpers (ported from lib/storage/keys.ts) ────────────────

func feedImageKey(filename string) string { return feedImagePrefix + filename }
func feedImageURL(filename string) string { return "/api/feed/image/" + filename }

var contentTypes = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif":  "image/gif",
}

func contentTypeForFilename(filename string) string {
	dot := strings.LastIndex(filename, ".")
	if dot < 0 {
		return "application/octet-stream"
	}
	if ct, ok := contentTypes[strings.ToLower(filename[dot:])]; ok {
		return ct
	}
	return "application/octet-stream"
}

// detectImageExt returns the file extension implied by the buffer's magic bytes,
// or "" if unrecognized. Mirrors lib/slice-it/upload-validation detectImageExt.
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

// validateImageBuffer reports whether the bytes look like a supported image.
// We treat a recognized magic-byte signature as valid (lighter than the Node
// validator, which also enforces dimensions/size — those checks would require
// an image-decode dependency and are noted as a fidelity gap in the report).
func validateImageBuffer(buf []byte) bool {
	return detectImageExt(buf) != ""
}

// putObject lives in storage.go and dispatches to the S3 or local backend.
