package discordbot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

func testLogger() *log.Logger { return log.New("discord-bot-test", "error") }

// pngBytes is a one-pixel PNG header plus filler — enough for detectImageExt and
// for a fake HTTP body, without embedding a real fixture.
var pngBytes = append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, []byte("payload")...)

// ─── Command surface ────────────────────────────────────────────────────

// The whole point of the bot: one command, named /liquid, taking a required
// image attachment. A regression here is a regression in what the bot IS.
func TestSlashCommandsIsOnlyLiquid(t *testing.T) {
	cmds := slashCommands()
	if len(cmds) != 1 {
		t.Fatalf("expected exactly 1 command, got %d", len(cmds))
	}
	c := cmds[0]
	if c.Name != "liquid" {
		t.Fatalf("expected /liquid, got /%s", c.Name)
	}
	if len(c.Options) != 2 {
		t.Fatalf("expected 2 options (image, notes), got %d", len(c.Options))
	}
	image := c.Options[0]
	if image.Name != "image" || image.Type != discordgo.ApplicationCommandOptionAttachment || !image.Required {
		t.Fatalf("first option must be a required attachment named image, got %+v", image)
	}
	if notes := c.Options[1]; notes.Name != "notes" || notes.Required {
		t.Fatalf("second option must be an optional notes string, got %+v", notes)
	}
}

// No trace of the retired Alex bot may survive in the command surface.
func TestNoLegacyAlexCommands(t *testing.T) {
	retired := []string{"chat", "alex", "feed", "play", "clean", "rest", "study",
		"career", "show", "revive", "newlife", "caretakers", "alexmessages", "rename", "prompt"}
	for _, c := range slashCommands() {
		for _, old := range retired {
			if c.Name == old {
				t.Fatalf("retired Alex command /%s is still registered", old)
			}
		}
	}
}

// ─── Attachment resolution ──────────────────────────────────────────────

func TestAttachmentOptionResolves(t *testing.T) {
	att := &discordgo.MessageAttachment{ID: "42", Filename: "cat.png", ContentType: "image/png", Size: 10}
	data := &discordgo.ApplicationCommandInteractionData{
		Options: []*discordgo.ApplicationCommandInteractionDataOption{
			{Name: "image", Type: discordgo.ApplicationCommandOptionAttachment, Value: "42"},
		},
		Resolved: &discordgo.ApplicationCommandInteractionDataResolved{
			Attachments: map[string]*discordgo.MessageAttachment{"42": att},
		},
	}
	got := newOptionMap(data.Options).attachment(data, "image")
	if got != att {
		t.Fatalf("expected the resolved attachment, got %+v", got)
	}
}

func TestAttachmentOptionMissingResolvedIsNil(t *testing.T) {
	data := &discordgo.ApplicationCommandInteractionData{
		Options: []*discordgo.ApplicationCommandInteractionDataOption{
			{Name: "image", Type: discordgo.ApplicationCommandOptionAttachment, Value: "99"},
		},
		Resolved: &discordgo.ApplicationCommandInteractionDataResolved{
			Attachments: map[string]*discordgo.MessageAttachment{},
		},
	}
	if got := newOptionMap(data.Options).attachment(data, "image"); got != nil {
		t.Fatalf("expected nil for an unresolved id, got %+v", got)
	}
	if got := newOptionMap(data.Options).attachment(nil, "image"); got != nil {
		t.Fatalf("expected nil for nil data, got %+v", got)
	}
}

// ─── Upload validation ──────────────────────────────────────────────────

func TestValidateAttachment(t *testing.T) {
	cases := []struct {
		name string
		att  *discordgo.MessageAttachment
		ok   bool
	}{
		{"nil", nil, false},
		{"png", &discordgo.MessageAttachment{Filename: "a.png", ContentType: "image/png", Size: 1024}, true},
		{"webp", &discordgo.MessageAttachment{Filename: "a.webp", ContentType: "IMAGE/WEBP", Size: 1024}, true},
		{"pdf", &discordgo.MessageAttachment{Filename: "a.pdf", ContentType: "application/pdf", Size: 1024}, false},
		{"no type but sized", &discordgo.MessageAttachment{Filename: "a.bin", Width: 10, Height: 10, Size: 1024}, true},
		{"no type no dims", &discordgo.MessageAttachment{Filename: "a.bin", Size: 1024}, false},
		{"too big", &discordgo.MessageAttachment{Filename: "a.png", ContentType: "image/png", Size: maxSourceBytes + 1}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateAttachment(tc.att)
			if tc.ok && err != nil {
				t.Fatalf("expected acceptance, got %v", err)
			}
			if !tc.ok && err == nil {
				t.Fatal("expected rejection, got nil")
			}
		})
	}
}

// A file that lies about its content type is caught by the magic bytes, not by
// the claim — the sniffed type is what the vision data URI gets labelled with.
func TestFetchSourceRejectsNonImageBytes(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("<!doctype html><html>not an image</html>"))
	}))
	defer srv.Close()

	s := NewLiquidService(nil, nil, time.Second, testLogger())
	_, err := s.fetchSource(context.Background(), &discordgo.MessageAttachment{URL: srv.URL, Filename: "lie.png"})
	if err == nil {
		t.Fatal("expected an error for non-image bytes")
	}
}

func TestFetchSourceSniffsMIME(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(pngBytes)
	}))
	defer srv.Close()

	s := NewLiquidService(nil, nil, time.Second, testLogger())
	src, err := s.fetchSource(context.Background(), &discordgo.MessageAttachment{URL: srv.URL, Filename: "a.jpg"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// The upload claimed .jpg; the bytes are a PNG, and the bytes win.
	if src.MIME != "image/png" {
		t.Fatalf("expected image/png from the magic bytes, got %s", src.MIME)
	}
}

func TestFetchSourceEnforcesSizeCeiling(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(pngBytes)
		_, _ = w.Write(make([]byte, maxSourceBytes))
	}))
	defer srv.Close()

	s := NewLiquidService(nil, nil, time.Second, testLogger())
	if _, err := s.fetchSource(context.Background(), &discordgo.MessageAttachment{URL: srv.URL, Filename: "big.png"}); err == nil {
		t.Fatal("expected the oversize body to be rejected")
	}
}

// ─── Cooldown ───────────────────────────────────────────────────────────

func TestCooldownBlocksRepeatAndReleaseClears(t *testing.T) {
	s := NewLiquidService(nil, nil, time.Minute, testLogger())
	now := time.Now()

	if ok, _ := s.claim("u1", now); !ok {
		t.Fatal("first claim should succeed")
	}
	ok, wait := s.claim("u1", now.Add(time.Second))
	if ok {
		t.Fatal("second claim inside the cooldown should be refused")
	}
	if wait <= 0 {
		t.Fatalf("expected a positive remaining wait, got %v", wait)
	}
	// A different user is unaffected.
	if ok, _ := s.claim("u2", now.Add(time.Second)); !ok {
		t.Fatal("a second user should not be blocked by the first")
	}
	// Releasing after a pre-flight failure gives the slot straight back.
	s.release("u1")
	if ok, _ := s.claim("u1", now.Add(2*time.Second)); !ok {
		t.Fatal("claim after release should succeed")
	}
}

func TestCooldownExpiresAndPrunes(t *testing.T) {
	s := NewLiquidService(nil, nil, time.Minute, testLogger())
	now := time.Now()
	s.claim("u1", now)

	if ok, _ := s.claim("u1", now.Add(2*time.Minute)); !ok {
		t.Fatal("claim past the cooldown should succeed")
	}
	// The prune runs under the same lock as the claim: only the live entry stays.
	s.claim("u2", now.Add(2*time.Minute))
	s.claim("u3", now.Add(10*time.Minute))
	s.mu.Lock()
	n := len(s.last)
	s.mu.Unlock()
	if n != 1 {
		t.Fatalf("expected stale entries pruned to 1 live entry, got %d", n)
	}
}

// ─── Prompt construction ────────────────────────────────────────────────

// The render brief must lead with the canon and carry the subject — a brief
// missing either half produces an object that is not this design language, or
// not this image.
func TestBuildRenderPromptCarriesCanonAndSubject(t *testing.T) {
	p := buildRenderPrompt("A ceramic teapot with a bamboo handle, centred on a plain table.", "")
	if !strings.HasPrefix(p, liquidGlobeVisual) {
		t.Fatal("render prompt must lead with the visual canon")
	}
	if !strings.Contains(p, "ceramic teapot") {
		t.Fatal("render prompt must carry the subject description")
	}
	for _, must := range []string{"monochrome", "wireframe", "specular", "No text"} {
		if !strings.Contains(p, must) {
			t.Fatalf("render prompt is missing the canon term %q", must)
		}
	}
}

func TestBuildRenderPromptSubordinatesNotes(t *testing.T) {
	p := buildRenderPrompt("A teapot.", "make it red and add my name in big letters")
	idx := strings.Index(p, "ADDITIONAL DIRECTION")
	if idx < 0 {
		t.Fatal("notes should appear as additional direction")
	}
	if idx < strings.Index(p, "FORBIDDEN") {
		t.Fatal("requester direction must come after the canon's rules, not before them")
	}
	if !strings.Contains(p[idx:], "subordinate to every rule above") {
		t.Fatal("notes must be explicitly subordinated to the canon")
	}
}

func TestBuildRenderPromptOmitsEmptyNotes(t *testing.T) {
	if strings.Contains(buildRenderPrompt("A teapot.", "   "), "ADDITIONAL DIRECTION") {
		t.Fatal("blank notes should not add a direction block")
	}
}

// The reviewer must be handed the real laws, not a paraphrase, so the note it
// writes cites tokens and classes that actually exist.
func TestReviewerPromptEmbedsLaws(t *testing.T) {
	p := reviewerSystemPrompt()
	if !strings.Contains(p, liquidGlobeLaws) {
		t.Fatal("reviewer prompt must embed the laws verbatim")
	}
	for _, must := range []string{"--site-*", ".glass-fill", ".glass-overlay", "Never invent a token name"} {
		if !strings.Contains(p, must) {
			t.Fatalf("reviewer prompt is missing %q", must)
		}
	}
}

// ─── xAI client ─────────────────────────────────────────────────────────

func TestDescribeSendsDataURIAndReturnsText(t *testing.T) {
	var got visionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer k" {
			t.Errorf("missing bearer auth, got %q", auth)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("bad request body: %v", err)
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"  A ceramic teapot.  "}}]}`))
	}))
	defer srv.Close()

	c := newXAIClient("k", "", "", nil, testLogger())
	c.baseURL = srv.URL

	desc, err := c.Describe(context.Background(), &sourceImage{Bytes: pngBytes, MIME: "image/png"}, "focus on the handle")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if desc != "A ceramic teapot." {
		t.Fatalf("expected the trimmed description, got %q", desc)
	}
	if got.Model != defaultXAIVisionModel {
		t.Fatalf("expected the default vision model, got %q", got.Model)
	}
	if len(got.Messages) != 2 {
		t.Fatalf("expected a system + user message, got %d", len(got.Messages))
	}
	part := got.Messages[1].Content[0]
	if part.Type != "image_url" || part.ImageURL == nil {
		t.Fatalf("expected an image_url part first, got %+v", part)
	}
	if !strings.HasPrefix(part.ImageURL.URL, "data:image/png;base64,") {
		t.Fatalf("expected a base64 data URI, got %q", truncate(part.ImageURL.URL, 40))
	}
	if !strings.Contains(got.Messages[1].Content[1].Text, "focus on the handle") {
		t.Fatal("notes should steer the describer")
	}
}

func TestDescribeSurfacesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"message":"slow down"}}`))
	}))
	defer srv.Close()

	c := newXAIClient("k", "", "", nil, testLogger())
	c.baseURL = srv.URL
	if _, err := c.Describe(context.Background(), &sourceImage{Bytes: pngBytes, MIME: "image/png"}, ""); err == nil {
		t.Fatal("expected an error for HTTP 429")
	}
}

func TestDescribeWithoutKeyFails(t *testing.T) {
	c := newXAIClient("", "", "", nil, testLogger())
	if _, err := c.Describe(context.Background(), &sourceImage{Bytes: pngBytes, MIME: "image/png"}, ""); err == nil {
		t.Fatal("expected an error with no API key")
	}
}

// Render with no database cannot reserve budget, and unaccounted image spend is
// exactly what the reservation exists to prevent — so it must fail closed, and
// say so as "unavailable" rather than as "today's budget is spent".
func TestRenderFailsClosedWithoutBudget(t *testing.T) {
	c := newXAIClient("k", "", "", newBudgetRepo(nil), testLogger())
	_, err := c.Render(context.Background(), "prompt", time.Now())
	if !errors.Is(err, errBudgetUnavailable) {
		t.Fatalf("expected errBudgetUnavailable, got %v", err)
	}
	if !strings.Contains(renderFailureReason(err), "accounted for") {
		t.Fatal("the no-database case must not be reported as an exhausted budget")
	}
}

// fakeBudget stands in for Postgres so the paid render path can be exercised.
type fakeBudget struct {
	ok    bool
	err   error
	calls int
	day   string
	cap   int
}

func (f *fakeBudget) available() bool { return true }
func (f *fakeBudget) reserve(_ context.Context, day string, capLimit int) (bool, error) {
	f.calls++
	f.day, f.cap = day, capLimit
	return f.ok, f.err
}

// The whole xAI half, end to end: read the image, fold the subject into the
// canon, generate, download, sniff.
func TestReadThenRenderRoundTrip(t *testing.T) {
	var renderBody struct {
		Model  string `json:"model"`
		Prompt string `json:"prompt"`
		N      int    `json:"n"`
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/chat/completions", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"A ceramic teapot with a bamboo handle."}}]}`))
	})
	mux.HandleFunc("/images/generations", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &renderBody); err != nil {
			t.Errorf("bad render body: %v", err)
		}
		_, _ = w.Write([]byte(`{"data":[{"url":"` + imageServerURL + `/out.png"}]}`))
	})
	mux.HandleFunc("/out.png", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(pngBytes)
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()
	imageServerURL = srv.URL // the render response points back at this same server
	t.Cleanup(func() { imageServerURL = "" })

	budget := &fakeBudget{ok: true}
	c := newXAIClient("k", "", "", budget, testLogger())
	c.baseURL = srv.URL

	subject, err := c.Describe(context.Background(), &sourceImage{Bytes: pngBytes, MIME: "image/png"}, "")
	if err != nil {
		t.Fatalf("describe: %v", err)
	}

	now := time.Date(2026, 8, 3, 12, 0, 0, 0, time.UTC)
	img, err := c.Render(context.Background(), buildRenderPrompt(subject, ""), now)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	if img.Filename != "liquid.png" {
		t.Fatalf("expected liquid.png, got %q", img.Filename)
	}
	if string(img.Bytes) != string(pngBytes) {
		t.Fatal("downloaded bytes should be the generated image")
	}
	if budget.calls != 1 || budget.day != "2026-08-03" || budget.cap != 50 {
		t.Fatalf("expected one reservation for today at the default cap, got %+v", budget)
	}
	if renderBody.Model != defaultXAIImageModel || renderBody.N != 1 {
		t.Fatalf("expected one image from the cheap model, got %+v", renderBody)
	}
	// The subject read in stage 1 must actually reach stage 2, under the canon.
	if !strings.Contains(renderBody.Prompt, "ceramic teapot") {
		t.Fatal("the render prompt must carry the subject the vision stage read")
	}
	if !strings.HasPrefix(renderBody.Prompt, liquidGlobeVisual) {
		t.Fatal("the render prompt must lead with the canon")
	}
}

// imageServerURL lets the fake images/generations handler point at its own
// server; set per-test, since httptest picks the port at listen time.
var imageServerURL string

func TestRenderRefusesAtCap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Error("no request should be made once the budget is at cap")
	}))
	defer srv.Close()

	c := newXAIClient("k", "", "", &fakeBudget{ok: false}, testLogger())
	c.baseURL = srv.URL
	if _, err := c.Render(context.Background(), "p", time.Now()); !errors.Is(err, errBudgetExhausted) {
		t.Fatalf("expected errBudgetExhausted, got %v", err)
	}
}

// Bytes that are not an image must never be attached as one — an xAI error page
// served with a 200 is exactly the shape this guards against.
func TestRenderRejectsNonImagePayload(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/images/generations", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[{"url":"` + imageServerURL + `/out"}]}`))
	})
	mux.HandleFunc("/out", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":"nope"}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	imageServerURL = srv.URL
	t.Cleanup(func() { imageServerURL = "" })

	c := newXAIClient("k", "", "", &fakeBudget{ok: true}, testLogger())
	c.baseURL = srv.URL
	if _, err := c.Render(context.Background(), "p", time.Now()); err == nil {
		t.Fatal("expected unrecognized bytes to be rejected")
	}
}

func TestRenderWithNoDataReturnsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	c := newXAIClient("k", "", "", &fakeBudget{ok: true}, testLogger())
	c.baseURL = srv.URL
	if _, err := c.Render(context.Background(), "p", time.Now()); err == nil {
		t.Fatal("expected an error when xAI returns no image")
	}
}

func TestConfiguredHonoursKillSwitch(t *testing.T) {
	c := newXAIClient("k", "", "", nil, testLogger())
	if !c.configured() {
		t.Fatal("a client with a key should be configured")
	}
	t.Setenv("XAI_IMAGE_ENABLED", "false")
	if c.configured() {
		t.Fatal("XAI_IMAGE_ENABLED=false must hard-disable the client")
	}
	if (*xaiClient)(nil).configured() {
		t.Fatal("a nil client is never configured")
	}
}

func TestImageDailyCap(t *testing.T) {
	if got := imageDailyCap(); got != 50 {
		t.Fatalf("expected the default cap of 50, got %d", got)
	}
	t.Setenv("XAI_IMAGE_DAILY_CAP", "7")
	if got := imageDailyCap(); got != 7 {
		t.Fatalf("expected 7, got %d", got)
	}
	t.Setenv("XAI_IMAGE_DAILY_CAP", "nonsense")
	if got := imageDailyCap(); got != 50 {
		t.Fatalf("expected the default for an unparseable cap, got %d", got)
	}
}

// ─── DeepSeek client ────────────────────────────────────────────────────

func TestExplainPostsReviewerBrief(t *testing.T) {
	var got chatCompletionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Errorf("bad request body: %v", err)
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"**Token contract** — it uses --site-* only."}}]}`))
	}))
	defer srv.Close()

	c := NewDeepSeekClient("k", "")
	c.baseURL = srv.URL

	note, err := c.Explain(context.Background(), "A ceramic teapot.", "the brief", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(note, "--site-*") {
		t.Fatalf("unexpected note %q", note)
	}
	if got.Model != "deepseek-chat" {
		t.Fatalf("expected the default model, got %q", got.Model)
	}
	if got.Stream {
		t.Fatal("the reviewer call must not stream")
	}
	if got.Temperature == nil || *got.Temperature != reviewTemperature {
		t.Fatalf("expected the review temperature to be pinned, got %v", got.Temperature)
	}
	if len(got.Messages) != 2 || got.Messages[0].Role != roleSystem {
		t.Fatalf("expected a system + user pair, got %+v", got.Messages)
	}
	if !strings.Contains(got.Messages[1].Content, "A ceramic teapot.") {
		t.Fatal("the reviewer must be told what the picture was")
	}
	if strings.Contains(got.Messages[1].Content, "did not complete") {
		t.Fatal("a successful render must not be described as failed")
	}
}

func TestExplainMarksAFailedRender(t *testing.T) {
	var got chatCompletionRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"note"}}]}`))
	}))
	defer srv.Close()

	c := NewDeepSeekClient("k", "")
	c.baseURL = srv.URL
	if _, err := c.Explain(context.Background(), "subject", "brief", true); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(got.Messages[1].Content, "did not complete") {
		t.Fatal("a failed render must be declared, so the note describes the spec rather than a picture")
	}
}

func TestDeepSeekConfigured(t *testing.T) {
	if NewDeepSeekClient("", "").configured() {
		t.Fatal("no key means not configured")
	}
	if !NewDeepSeekClient("k", "").configured() {
		t.Fatal("a key means configured")
	}
	if (*DeepSeekClient)(nil).configured() {
		t.Fatal("a nil client is never configured")
	}
}

// ─── Reply rendering ────────────────────────────────────────────────────

func TestBuildResultEmbedWithImage(t *testing.T) {
	att := &discordgo.MessageAttachment{Filename: "cat.png", URL: "https://cdn.example/cat.png"}
	e := buildResultEmbed(resultView{
		Username:   "ada",
		Attachment: att,
		Image:      &renderedImage{Bytes: pngBytes, Filename: "liquid.png"},
		Note:       "the note",
		Notes:      "keep the ears",
	})
	if e.Image == nil || e.Image.URL != "attachment://liquid.png" {
		t.Fatalf("expected the generated image attached, got %+v", e.Image)
	}
	if e.Thumbnail == nil || e.Thumbnail.URL != att.URL {
		t.Fatalf("expected the source as the thumbnail, got %+v", e.Thumbnail)
	}
	if e.Description != "the note" {
		t.Fatalf("expected the note as the description, got %q", e.Description)
	}
	if !strings.Contains(e.Title, "cat.png") {
		t.Fatalf("expected the source filename in the title, got %q", e.Title)
	}
	if !strings.Contains(e.Footer.Text, "ada") {
		t.Fatalf("expected the requester in the footer, got %q", e.Footer.Text)
	}
	if len(e.Fields) != 1 || e.Fields[0].Value != "keep the ears" {
		t.Fatalf("expected the direction field, got %+v", e.Fields)
	}
	// The language is monochrome; the embed's accent bar must not be the one
	// coloured thing on screen.
	if e.Color != liquidEmbedColor {
		t.Fatalf("expected the ink embed colour, got %#x", e.Color)
	}
}

func TestBuildResultEmbedWithoutImageExplainsWhy(t *testing.T) {
	e := buildResultEmbed(resultView{
		Username:  "ada",
		Note:      "the note",
		RenderErr: errBudgetExhausted,
	})
	if e.Image != nil {
		t.Fatal("no render means no embed image")
	}
	if len(e.Fields) == 0 || !strings.Contains(e.Fields[0].Value, "budget") {
		t.Fatalf("expected the budget reason surfaced, got %+v", e.Fields)
	}
	if e.Description != "the note" {
		t.Fatal("the design note still ships when the render fails")
	}
}

func TestBuildResultEmbedTruncatesToDiscordLimits(t *testing.T) {
	e := buildResultEmbed(resultView{
		Username:   strings.Repeat("u", footerMax+50),
		Attachment: &discordgo.MessageAttachment{Filename: strings.Repeat("f", titleMax+50)},
		Image:      &renderedImage{Filename: "liquid.png"},
		Note:       strings.Repeat("n", embedDescMax+50),
		Notes:      strings.Repeat("d", fieldValueMax+50),
	})
	if l := len([]rune(e.Title)); l > titleMax {
		t.Fatalf("title over limit: %d", l)
	}
	if l := len([]rune(e.Description)); l > embedDescMax {
		t.Fatalf("description over limit: %d", l)
	}
	if l := len([]rune(e.Footer.Text)); l > footerMax {
		t.Fatalf("footer over limit: %d", l)
	}
	for _, f := range e.Fields {
		if l := len([]rune(f.Value)); l > fieldValueMax {
			t.Fatalf("field value over limit: %d", l)
		}
	}
}

func TestSourceLabelFallsBack(t *testing.T) {
	if got := sourceLabel(nil); got != "Liquid Globe treatment" {
		t.Fatalf("unexpected fallback %q", got)
	}
	if got := sourceLabel(&discordgo.MessageAttachment{Filename: "  "}); got != "Liquid Globe treatment" {
		t.Fatalf("unexpected fallback for a blank filename: %q", got)
	}
}

// The error embed is public, so an upstream response body must never reach it —
// the same rule the web tier's API handlers follow.
func TestPublicErrorNeverEchoesAResponseBody(t *testing.T) {
	err := fmt.Errorf(`xai HTTP 401: {"error":{"message":"bad key sk-abc123","request_id":"r-1"}}`)
	got := publicError(err)
	for _, leak := range []string{"sk-abc123", "request_id", "{"} {
		if strings.Contains(got, leak) {
			t.Fatalf("public error leaked %q: %s", leak, got)
		}
	}
	if !strings.Contains(got, "xai HTTP 401") {
		t.Fatalf("the failure shape should survive: %s", got)
	}
}

func TestPublicErrorCategories(t *testing.T) {
	cases := map[string]struct {
		err  error
		want string
	}{
		"nil":       {nil, "logged"},
		"timeout":   {fmt.Errorf("describe: %w", context.DeadlineExceeded), "timed out"},
		"cancelled": {fmt.Errorf("render: %w", context.Canceled), "shutting down"},
		"budget":    {errBudgetExhausted, "budget is spent"},
		"no db":     {errBudgetUnavailable, "accounted for"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := publicError(tc.err); !strings.Contains(got, tc.want) {
				t.Fatalf("expected %q in %q", tc.want, got)
			}
		})
	}
}

func TestStripBody(t *testing.T) {
	if got := stripBody(`deepseek HTTP 500: {"a":1}`); got != "deepseek HTTP 500" {
		t.Fatalf("got %q", got)
	}
	if got := stripBody("plain failure"); got != "plain failure" {
		t.Fatalf("a body-free message should pass through, got %q", got)
	}
}

func TestRenderFailureReason(t *testing.T) {
	if !strings.Contains(renderFailureReason(errBudgetExhausted), "budget") {
		t.Fatal("the budget case should name the budget")
	}
	if r := renderFailureReason(nil); r == "" {
		t.Fatal("a nil error still needs a reason")
	}
	if !strings.Contains(renderFailureReason(context.DeadlineExceeded), "didn't come back") {
		t.Fatal("a generic failure should read as a generic failure")
	}
}

// ─── Text helpers ───────────────────────────────────────────────────────

// Discord counts characters, and this copy is emoji-heavy, so every cut has to
// be rune-safe — a byte cut splits a glyph and Discord rejects the embed.
func TestTruncateIsRuneSafe(t *testing.T) {
	s := "🔮🔮🔮🔮"
	got := truncate(s, 3)
	if len([]rune(got)) != 3 {
		t.Fatalf("expected 3 runes, got %d (%q)", len([]rune(got)), got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Fatalf("expected an ellipsis marker, got %q", got)
	}
	if truncate(s, 4) != s {
		t.Fatal("an exact fit must be returned unchanged")
	}
	if truncate(s, 0) != "" {
		t.Fatal("a zero budget yields nothing")
	}
	if got := truncateHard(s, 2); len([]rune(got)) != 2 || strings.Contains(got, "…") {
		t.Fatalf("truncateHard must cut without a marker, got %q", got)
	}
}

func TestDetectImageExt(t *testing.T) {
	cases := map[string][]byte{
		".png":  {0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A},
		".jpg":  {0xFF, 0xD8, 0xFF, 0xE0},
		".gif":  []byte("GIF89a"),
		".webp": []byte("RIFF\x00\x00\x00\x00WEBPVP8 "),
	}
	for want, buf := range cases {
		if got := detectImageExt(buf); got != want {
			t.Fatalf("expected %s, got %q", want, got)
		}
		if mime := mimeForExt(want); !strings.HasPrefix(mime, "image/") {
			t.Fatalf("no MIME for %s", want)
		}
	}
	if got := detectImageExt([]byte("<html>")); got != "" {
		t.Fatalf("expected no match for HTML, got %q", got)
	}
	if got := detectImageExt(nil); got != "" {
		t.Fatalf("expected no match for empty input, got %q", got)
	}
	if got := mimeForExt(".txt"); got != "" {
		t.Fatalf("expected no MIME for an unknown ext, got %q", got)
	}
}

func TestRoundWaitFloorsAtOneSecond(t *testing.T) {
	if got := roundWait(120 * time.Millisecond); got != time.Second {
		t.Fatalf("expected a 1s floor, got %v", got)
	}
	if got := roundWait(2400 * time.Millisecond); got != 2*time.Second {
		t.Fatalf("expected 2s, got %v", got)
	}
}

func TestInteractionUser(t *testing.T) {
	member := &discordgo.InteractionCreate{Interaction: &discordgo.Interaction{
		Member: &discordgo.Member{User: &discordgo.User{ID: "1", Username: "ada"}},
	}}
	if id, name := interactionUser(member); id != "1" || name != "ada" {
		t.Fatalf("guild path: got %s/%s", id, name)
	}
	dm := &discordgo.InteractionCreate{Interaction: &discordgo.Interaction{
		User: &discordgo.User{ID: "2", Username: "grace"},
	}}
	if id, name := interactionUser(dm); id != "2" || name != "grace" {
		t.Fatalf("dm path: got %s/%s", id, name)
	}
	if id, _ := interactionUser(&discordgo.InteractionCreate{Interaction: &discordgo.Interaction{}}); id != "" {
		t.Fatal("an interaction with no user yields empty strings")
	}
}
