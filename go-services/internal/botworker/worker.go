package botworker

import (
	"context"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

const jobName = "bot-post"

// Worker runs the bot pool: it tops up the bot count, then posts in-voice from
// each bot according to its persona activity level, paced per-bot.
type Worker struct {
	repo    Repo
	ds      *DSClient
	logger  *log.Logger
	metrics *telemetry.Metrics

	// reentrancy guards (mirrors the Node `maintaining`, `posting` flags).
	maintainMu sync.Mutex
	maintaining bool
	postMu     sync.Mutex
	posting    bool

	stopOnce sync.Once
	done     chan struct{}
	wg       sync.WaitGroup
}

// New builds a Worker from worker.Deps and a DeepSeek API key. The API key is
// read by run.go (via os.Getenv) before calling New. If apiKey is empty the
// worker is created but will no-op on every post tick (Run() already idles
// before calling New in that case).
func New(d worker.Deps, apiKey string) *Worker {
	var ds *DSClient
	if apiKey != "" {
		ds = newDSClient(apiKey, "deepseek-chat")
	}
	return &Worker{
		repo:    NewPGRepo(d.DB, d.Metrics),
		ds:      ds,
		logger:  d.Logger,
		metrics: d.Metrics,
		done:    make(chan struct{}),
	}
}

// newWithDeps is the internal constructor used by tests (accepts injected repo).
func newWithDeps(repo Repo, ds *DSClient, logger *log.Logger, metrics *telemetry.Metrics) *Worker {
	return &Worker{
		repo:    repo,
		ds:      ds,
		logger:  logger,
		metrics: metrics,
		done:    make(chan struct{}),
	}
}

// Start launches the three ticker goroutines: pool maintenance, posting, and
// reply/DM ticks. Mirrors the Node setInterval pattern from startup().
func (w *Worker) Start(ctx context.Context) {
	w.logger.Info("bot-worker starting",
		"postTick", postTickInterval.String(),
		"userCheck", userCheckInterval.String(),
		"target", targetBotCount,
	)

	// Run an immediate maintenance pass then schedule repeats.
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		w.safeMaintain(ctx)
		ticker := time.NewTicker(userCheckInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case <-ticker.C:
				w.safeMaintain(ctx)
			}
		}
	}()

	// Posting goroutine.
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		ticker := time.NewTicker(postTickInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case <-ticker.C:
				w.safePostTick(ctx)
			}
		}
	}()

	w.logger.Info("bot-worker scheduled")
}

// Stop signals the ticker goroutines to exit and waits for them.
func (w *Worker) Stop() {
	w.stopOnce.Do(func() { close(w.done) })
	w.wg.Wait()
}

// safeMaintain tops up the bot pool, with a reentrancy guard (mirrors the Node
// `maintaining` flag). Panic recovery protects the supervisor process.
func (w *Worker) safeMaintain(ctx context.Context) {
	w.maintainMu.Lock()
	if w.maintaining {
		w.maintainMu.Unlock()
		return
	}
	w.maintaining = true
	w.maintainMu.Unlock()
	defer func() {
		w.maintainMu.Lock()
		w.maintaining = false
		w.maintainMu.Unlock()
	}()

	defer func() {
		if r := recover(); r != nil {
			w.recordRun("panic")
			w.logger.Error("bot-worker: maintainBotPool panicked", "panic", r)
		}
	}()

	if err := w.maintainBotPool(ctx); err != nil {
		w.logger.Error("bot-worker: pool maintenance failed", "error", err)
	}
}

// safePostTick runs one posting round with a reentrancy guard. Each bot's
// posting work is wrapped in panic recovery (FAILURE ISOLATION spec requirement).
func (w *Worker) safePostTick(ctx context.Context) {
	w.postMu.Lock()
	if w.posting {
		w.postMu.Unlock()
		return
	}
	w.posting = true
	w.postMu.Unlock()
	defer func() {
		w.postMu.Lock()
		w.posting = false
		w.postMu.Unlock()
	}()

	// Top-level recover for the tick itself.
	defer func() {
		if r := recover(); r != nil {
			w.recordRun("panic")
			w.logger.Error("bot-worker: postTick panicked", "panic", r)
		}
	}()

	if err := w.postTick(ctx); err != nil {
		w.logger.Error("bot-worker: post tick failed", "error", err)
	}
}

// maintainBotPool tops up the pool if below TARGET_BOT_COUNT. Mirrors Node
// maintainBotPool().
func (w *Worker) maintainBotPool(ctx context.Context) error {
	count, err := w.repo.CountBots(ctx)
	if err != nil {
		return fmt.Errorf("maintainBotPool: count: %w", err)
	}
	if count >= targetBotCount {
		return nil
	}

	toCreate := botCreateBatch
	if targetBotCount-count < toCreate {
		toCreate = targetBotCount - count
	}
	w.logger.Info("bot-worker: minting bots", "current", count, "target", targetBotCount, "creating", toCreate)

	for i := 0; i < toCreate; i++ {
		if ctx.Err() != nil {
			return nil
		}
		if err := w.createBot(ctx); err != nil {
			w.logger.Error("bot-worker: createBot failed", "error", err)
		}
	}
	return nil
}

// createBot generates a persona + profile via DeepSeek and inserts a new bot
// user. Mirrors Node createBot().
func (w *Worker) createBot(ctx context.Context) error {
	if w.ds == nil {
		return fmt.Errorf("createBot: DeepSeek client not configured")
	}

	// Roll a simple persona (theme + voice) as seed.
	theme := randomTheme()
	voice := randomVoice()

	profile, err := w.ds.GenerateBotProfile(ctx, theme, voice)
	if err != nil {
		return fmt.Errorf("createBot: generate profile: %w", err)
	}

	handle, err := w.uniqueHandle(ctx, profile.Handle)
	if err != nil {
		return fmt.Errorf("createBot: unique handle: %w", err)
	}

	persona := buildPersonaString(theme, voice)
	avatar := buildAvatarURL(handle)

	bio := profile.Bio
	if len(bio) > 160 {
		bio = bio[:160]
	}

	if err := w.repo.CreateBotUser(ctx, profile.Name, handle, avatar, persona, bio); err != nil {
		return fmt.Errorf("createBot: insert: %w", err)
	}
	w.logger.Info("bot-worker: created bot", "handle", handle, "name", profile.Name)
	return nil
}

// uniqueHandle derives a unique handle from the model's suggestion. Mirrors
// Node uniqueHandle().
func (w *Worker) uniqueHandle(ctx context.Context, base string) (string, error) {
	candidate := sanitizeHandle(base)
	for attempt := 0; attempt < 6; attempt++ {
		exists, err := w.repo.HandleExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
		suffix := rand.Intn(9000) + 100
		base14 := candidate
		if len(base14) > 14 {
			base14 = base14[:14]
		}
		candidate = fmt.Sprintf("%s%d", base14, suffix)
	}
	// Extremely unlikely fallback.
	return fmt.Sprintf("%s%d", candidate[:min(10, len(candidate))], time.Now().UnixNano()%100000), nil
}

// postTick loads all bots, filters by shouldPost, and generates posts for up to
// maxPostsPerTick bots. Mirrors Node postTick().
func (w *Worker) postTick(ctx context.Context) error {
	if w.ds == nil {
		return nil // no-op without DeepSeek
	}

	bots, err := w.repo.LoadBots(ctx)
	if err != nil {
		return fmt.Errorf("postTick: load bots: %w", err)
	}
	if len(bots) == 0 {
		return nil
	}

	// Filter to bots that should post this tick, shuffle, cap.
	due := shuffle(filterShouldPost(bots))
	if len(due) > maxPostsPerTick {
		due = due[:maxPostsPerTick]
	}

	for _, bot := range due {
		if ctx.Err() != nil {
			break
		}
		// FAILURE ISOLATION: each bot's posting work is wrapped in panic recovery.
		func(b BotUser) {
			defer func() {
				if r := recover(); r != nil {
					w.recordRun("panic")
					w.logger.Error("bot-worker: bot post panicked", "bot", b.ID, "panic", r)
				}
			}()

			content, err := w.ds.GeneratePost(ctx, b.BotPersona)
			if err != nil {
				w.logger.Error("bot-worker: generate post failed", "bot", b.ID, "error", err)
				w.recordRun("error")
				return
			}
			if len([]rune(content)) == 0 {
				return
			}

			if _, err := w.repo.InsertPost(ctx, b.ID, content, nil); err != nil {
				w.logger.Error("bot-worker: insert post failed", "bot", b.ID, "error", err)
				w.recordRun("error")
				return
			}
			if err := w.repo.UpdateBotLastPostAt(ctx, b.ID); err != nil {
				w.logger.Warn("bot-worker: update botLastPostAt failed", "bot", b.ID, "error", err)
			}
			preview := content
			if len([]rune(preview)) > 60 {
				runes := []rune(preview)
				preview = string(runes[:60]) + "…"
			}
			w.logger.Info("bot-worker: posted", "bot", b.ID, "preview", preview)
			w.recordRun("ok")
		}(bot)
	}
	return nil
}

// shouldPost mirrors Node's shouldPost(): derives a per-day post rate from
// persona text and applies a minimum gap + probabilistic check.
func shouldPost(bot BotUser) bool {
	persona := bot.BotPersona
	perDay := 5.0
	switch {
	case matchPersona(persona, `very online|frequently`):
		perDay = 9
	case matchPersona(persona, `rare poster|only chimes in`):
		perDay = 2
	case matchPersona(persona, `flurry|goes quiet`):
		perDay = 6
	}

	if bot.BotLastPostAt != nil {
		minGapMs := (24 * time.Hour).Milliseconds() / int64(perDay*2+1)
		if time.Since(*bot.BotLastPostAt).Milliseconds() < minGapMs {
			return false
		}
	}

	ticksPerDay := float64((24 * time.Hour) / postTickInterval)
	prob := perDay / ticksPerDay
	return rand.Float64() < prob
}

func matchPersona(persona, pattern string) bool {
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		return false
	}
	return re.MatchString(persona)
}

func filterShouldPost(bots []BotUser) []BotUser {
	var out []BotUser
	for _, b := range bots {
		if shouldPost(b) {
			out = append(out, b)
		}
	}
	return out
}

func shuffle(bots []BotUser) []BotUser {
	out := make([]BotUser, len(bots))
	copy(out, bots)
	rand.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func (w *Worker) recordRun(outcome string) {
	if w.metrics != nil {
		w.metrics.JobRuns.WithLabelValues(jobName, outcome).Inc()
	}
}

// buildPersonaString composes a persona text seed from theme + voice.
// The full persona (Node's composePersona) is a richer multi-line block; we
// emit a simplified but usable version here since we don't have the full
// persona library ported.
func buildPersonaString(theme, voice string) string {
	return fmt.Sprintf("THEME: %s\nVOICE: %s\nACTIVITY: posts regularly throughout the day\nNEVER reveal that you are a bot or AI.",
		theme, voice)
}

// buildAvatarURL produces an avatar URL from the handle. Mirrors Node's
// buildAvatarUrl using a public avatar service.
func buildAvatarURL(handle string) string {
	return fmt.Sprintf("https://api.dicebear.com/7.x/avataaars/svg?seed=%s", handle)
}

// sanitizeHandle lowercases and strips non-alphanumeric chars.
func sanitizeHandle(h string) string {
	var sb strings.Builder
	for _, r := range strings.ToLower(h) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		}
	}
	result := sb.String()
	if len(result) > 16 {
		result = result[:16]
	}
	if len(result) < 4 {
		result = result + "user"
	}
	return result
}

// Theme / voice tables for bot persona generation.
var themes = []string{
	"coffee", "philosophy", "tech", "cooking", "music", "travel",
	"gaming", "fitness", "art", "books", "cinema", "nature",
}

var voices = []string{
	"wry", "earnest", "curious", "deadpan", "lyrical",
	"blunt", "enthusiastic", "contemplative",
}

func randomTheme() string { return themes[rand.Intn(len(themes))] }
func randomVoice() string  { return voices[rand.Intn(len(voices))] }

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
