// liquid.go is /liquid — the bot's only command, and the whole of what it does.
//
// The pipeline, in order:
//
//	validate the attachment  → an image, under the size cap, real image bytes
//	download it              → from Discord's CDN, capped
//	xAI READ                 → what is this a picture of?          (xai.go stage 1)
//	xAI RENDER               → that subject as a liquid globe       (xai.go stage 2)
//	DeepSeek EXPLAIN         → how the result obeys the language    (deepseek.go)
//	reply                    → one embed: the object, the note, the source
//
// Two degradations are deliberate. If the RENDER fails (no key, over budget, API
// hiccup) the command still replies with the note, marked as a spec rather than
// a picture — the design argument is most of the value. If the EXPLAIN fails but
// the render succeeded, the picture ships with a short static caption. Only a
// failed READ aborts, because without it there is no subject and the rest of the
// pipeline would be inventing one.
package discordbot

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// Embed colours: ink for a successful object (the language is monochrome, and
// the embed's own accent bar should not be the one thing on screen with a hue),
// red for a failure.
const (
	liquidEmbedColor = 0x111111
	liquidErrColor   = 0xef4444
)

// Discord embed limits the reply has to live within.
const (
	embedDescMax  = 4096
	fieldValueMax = 1024
	titleMax      = 256
	footerMax     = 2048
)

// defaultCooldown throttles one user's calls. Each /liquid is three model calls
// (two xAI, one DeepSeek) and one of them generates a paid image, so the floor
// is deliberately felt. Override with LIQUID_COOLDOWN.
const defaultCooldown = 45 * time.Second

// fallbackCaption ships with the picture when the reviewer call fails — the
// object is still correct, we just cannot say why in the model's words.
const fallbackCaption = "Re-made in **Radial Avant-Garde Glass**: one monochrome glass sphere, the subject's structure suspended in it as ink wireframe, lit by the single fixed scene light. The write-up couldn't be generated this time — the object stands on its own."

// LiquidService owns the /liquid pipeline and the per-user cooldown.
type LiquidService struct {
	xai      *xaiClient
	deepseek *DeepSeekClient
	logger   *log.Logger
	http     *http.Client
	cooldown time.Duration

	mu   sync.Mutex
	last map[string]time.Time // discord userId → last accepted invocation
}

func NewLiquidService(xai *xaiClient, deepseek *DeepSeekClient, cooldown time.Duration, logger *log.Logger) *LiquidService {
	if cooldown <= 0 {
		cooldown = defaultCooldown
	}
	return &LiquidService{
		xai:      xai,
		deepseek: deepseek,
		logger:   logger,
		http:     &http.Client{Timeout: 30 * time.Second},
		cooldown: cooldown,
		last:     make(map[string]time.Time),
	}
}

// ─── Cooldown ───────────────────────────────────────────────────────────

// claim reserves a slot for userID, returning false and the remaining wait when
// the user is still cooling down. Recorded on ACCEPT rather than on completion
// so a user cannot start a second render while the first is in flight.
func (s *LiquidService) claim(userID string, now time.Time) (bool, time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Prune while we hold the lock — this map is otherwise unbounded across the
	// lifetime of the process, one entry per user who ever ran the command.
	for id, at := range s.last {
		if now.Sub(at) > s.cooldown {
			delete(s.last, id)
		}
	}

	if at, ok := s.last[userID]; ok {
		if wait := s.cooldown - now.Sub(at); wait > 0 {
			return false, wait
		}
	}
	s.last[userID] = now
	return true, 0
}

// release gives a slot back when the command failed before spending anything,
// so a user who uploaded the wrong file type is not made to wait.
func (s *LiquidService) release(userID string) {
	s.mu.Lock()
	delete(s.last, userID)
	s.mu.Unlock()
}

// ─── The command ────────────────────────────────────────────────────────

// HandleLiquid implements /liquid.
func (s *LiquidService) HandleLiquid(ctx context.Context, sess *discordgo.Session, i *discordgo.InteractionCreate, att *discordgo.MessageAttachment, notes string) error {
	userID, username := interactionUser(i)
	now := time.Now().UTC()

	if !s.xai.configured() {
		return respondEphemeral(sess, i, "🫧 Image generation isn't configured on this instance — `XAI_API_KEY` is unset (or `XAI_IMAGE_ENABLED=false`).")
	}
	if ok, wait := s.claim(userID, now); !ok {
		return respondEphemeral(sess, i, fmt.Sprintf("🫧 Give the glass a moment to settle — try again in **%s**.", roundWait(wait)))
	}

	if err := validateAttachment(att); err != nil {
		s.release(userID)
		return respondEphemeral(sess, i, "🫧 "+err.Error())
	}

	// Everything past here can take the better part of a minute.
	if err := sess.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		s.release(userID)
		return fmt.Errorf("defer reply: %w", err)
	}

	src, err := s.fetchSource(ctx, att)
	if err != nil {
		s.release(userID)
		s.logger.Warn("liquid source fetch", "userId", userID, "error", err)
		return s.editError(sess, i, "Couldn't read that upload", err)
	}

	// READ. The only stage with no fallback: without a subject the render and the
	// review would both be describing an image nobody looked at.
	subject, err := s.xai.Describe(ctx, src, notes)
	if err != nil {
		s.release(userID)
		s.logger.Error("liquid describe", "userId", userID, "error", err)
		return s.editError(sess, i, "Couldn't read the image", err)
	}

	// RENDER.
	brief := buildRenderPrompt(subject, notes)
	img, renderErr := s.xai.Render(ctx, brief, now)
	if renderErr != nil {
		s.logger.Warn("liquid render", "userId", userID, "error", renderErr)
	}

	// EXPLAIN.
	note := ""
	if s.deepseek.configured() {
		note, err = s.deepseek.Explain(ctx, subject, brief, img == nil)
		if err != nil {
			s.logger.Error("liquid explain", "userId", userID, "error", err)
			note = ""
		}
	}
	if note == "" {
		note = fallbackCaption
	}

	// Nothing to show and nothing worth saying: report the render failure rather
	// than dressing it up as a result.
	if img == nil && !s.deepseek.configured() {
		return s.editError(sess, i, "Couldn't render the object", renderErr)
	}

	return s.editResult(sess, i, resultView{
		Username:   username,
		Attachment: att,
		Image:      img,
		Note:       note,
		Subject:    subject,
		Notes:      notes,
		RenderErr:  renderErr,
	})
}

// ─── Input validation ───────────────────────────────────────────────────

// validateAttachment rejects an upload before any paid work happens. Discord
// reports the content type and dimensions it sniffed itself, so a non-image is
// caught here and the bytes are never fetched.
func validateAttachment(att *discordgo.MessageAttachment) error {
	if att == nil {
		return fmt.Errorf("I need an image to work from — attach one to the `image` option.")
	}
	ct := strings.ToLower(strings.TrimSpace(att.ContentType))
	if ct != "" && !strings.HasPrefix(ct, "image/") {
		return fmt.Errorf("`%s` is a %s, not an image. PNG, JPEG, GIF or WebP, please.", att.Filename, ct)
	}
	if ct == "" && att.Width == 0 && att.Height == 0 {
		return fmt.Errorf("`%s` doesn't look like an image. PNG, JPEG, GIF or WebP, please.", att.Filename)
	}
	if att.Size > maxSourceBytes {
		return fmt.Errorf("`%s` is %.1f MB — the ceiling is %d MB.", att.Filename, float64(att.Size)/(1<<20), maxSourceBytes>>20)
	}
	return nil
}

// fetchSource downloads the attachment and confirms the bytes really are an
// image, whatever the content type claimed. The sniffed extension also decides
// the MIME the vision data URI is labelled with, so a mislabelled upload can't
// send the model a data URI that contradicts its own payload.
func (s *LiquidService) fetchSource(ctx context.Context, att *discordgo.MessageAttachment) (*sourceImage, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, att.URL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download attachment: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("attachment download HTTP %d", resp.StatusCode)
	}

	// One byte over the cap so a file that lies about its size is still caught.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxSourceBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read attachment: %w", err)
	}
	if len(raw) > maxSourceBytes {
		return nil, fmt.Errorf("that upload is over the %d MB ceiling", maxSourceBytes>>20)
	}
	ext := detectImageExt(raw)
	if ext == "" {
		return nil, fmt.Errorf("those bytes aren't a PNG, JPEG, GIF or WebP")
	}
	return &sourceImage{Bytes: raw, MIME: mimeForExt(ext), Filename: att.Filename}, nil
}

// ─── Reply rendering ────────────────────────────────────────────────────

// resultView is everything the success embed needs, gathered so buildResultEmbed
// stays a pure function and can be unit-tested without a Discord session.
type resultView struct {
	Username   string
	Attachment *discordgo.MessageAttachment
	Image      *renderedImage
	Note       string
	Subject    string
	Notes      string
	RenderErr  error
}

// buildResultEmbed renders the reply: the generated object as the embed image,
// the source as its thumbnail (straight off Discord's CDN — no re-upload), and
// the adherence note as the description.
func buildResultEmbed(v resultView) *discordgo.MessageEmbed {
	embed := &discordgo.MessageEmbed{
		Color:       liquidEmbedColor,
		Title:       truncateHard("🔮 "+sourceLabel(v.Attachment), titleMax),
		Description: truncate(v.Note, embedDescMax),
	}

	if v.Image != nil {
		embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + v.Image.Filename}
	} else {
		// No picture: say so where the picture would have been, and why.
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:  "⚠️ No render this time",
			Value: truncate(renderFailureReason(v.RenderErr), fieldValueMax),
		})
	}

	if v.Attachment != nil && v.Attachment.URL != "" {
		embed.Thumbnail = &discordgo.MessageEmbedThumbnail{URL: v.Attachment.URL}
	}
	if n := strings.TrimSpace(v.Notes); n != "" {
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:  "✍️ Direction",
			Value: truncate(n, fieldValueMax),
		})
	}

	embed.Footer = &discordgo.MessageEmbedFooter{
		Text: truncateHard("Radial Avant-Garde Glass · for "+v.Username, footerMax),
	}
	return embed
}

// renderFailureReason turns a render error into something a person can act on.
func renderFailureReason(err error) string {
	switch {
	case err == nil:
		return "The render didn't come back, but the treatment above is what it would be."
	case errors.Is(err, errBudgetExhausted):
		return "Today's image budget is spent — the note is above, and the glass is back tomorrow."
	case errors.Is(err, errBudgetUnavailable):
		return "Image spend can't be accounted for on this instance, so nothing was generated. The treatment above still stands."
	default:
		return "The renderer didn't come back this time (`" + truncate(err.Error(), 200) + "`). The treatment above still stands."
	}
}

// sourceLabel names the object after the file it came from, falling back to a
// generic title for an upload with no usable filename.
func sourceLabel(att *discordgo.MessageAttachment) string {
	if att == nil || strings.TrimSpace(att.Filename) == "" {
		return "Liquid Globe treatment"
	}
	return att.Filename + " — liquefied"
}

func (s *LiquidService) editResult(sess *discordgo.Session, i *discordgo.InteractionCreate, v resultView) error {
	edit := &discordgo.WebhookEdit{Embeds: &[]*discordgo.MessageEmbed{buildResultEmbed(v)}}
	if v.Image != nil {
		edit.Files = []*discordgo.File{{
			Name:   v.Image.Filename,
			Reader: bytes.NewReader(v.Image.Bytes),
		}}
	}
	_, err := sess.InteractionResponseEdit(i.Interaction, edit)
	return err
}

func (s *LiquidService) editError(sess *discordgo.Session, i *discordgo.InteractionCreate, title string, cause error) error {
	_, err := sess.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
		Embeds: &[]*discordgo.MessageEmbed{{
			Color:       liquidErrColor,
			Title:       truncateHard("❌ "+title, titleMax),
			Description: publicError(cause),
		}},
	})
	return err
}

// publicError renders a cause for a message anyone in the channel can read. The
// full error is already in the logs; what goes to the channel is the shape of
// the failure, never an upstream response body — the same rule the web tier's
// API handlers follow (app/CLAUDE.md: never echo the caught error to the
// caller). A provider's error body can carry request echoes and account detail
// that has no business in a public embed.
func publicError(err error) string {
	switch {
	case err == nil:
		return "Something broke on the way through. It's been logged."
	case errors.Is(err, context.DeadlineExceeded):
		return "That took too long and timed out. Try again in a moment."
	case errors.Is(err, context.Canceled):
		return "That was cut short — the bot was shutting down. Try again."
	case errors.Is(err, errBudgetExhausted), errors.Is(err, errBudgetUnavailable):
		return renderFailureReason(err)
	}
	return "`" + truncate(stripBody(err.Error()), 200) + "` — the details are in the logs."
}

// stripBody cuts an error message at the start of an embedded response body, so
// "xai HTTP 401: {\"error\":…}" reaches the channel as "xai HTTP 401".
func stripBody(msg string) string {
	if i := strings.IndexAny(msg, "{<"); i >= 0 {
		return strings.TrimRight(strings.TrimSpace(msg[:i]), ":")
	}
	return msg
}

// roundWait renders a cooldown remainder as whole seconds — sub-second precision
// in a "try again in…" message is noise.
func roundWait(d time.Duration) time.Duration {
	if d < time.Second {
		return time.Second
	}
	return d.Round(time.Second)
}
