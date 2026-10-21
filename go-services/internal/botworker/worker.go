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

// Job names for JobRuns telemetry. Each tick records ok/error/panic per attempt.
const (
	jobName     = "bot-post"
	jobReply    = "bot-reply"
	jobDM       = "bot-dm"
	jobMaintain = "bot-maintain"
)

// Worker runs the bot pool: it tops up the bot count, then posts in-voice from
// each bot according to its persona activity level, paced per-bot. It also runs
// the reply tick (reactive + proactive bot replies) and the DM tick (reactive +
// initiated DMs, with the SSE notify bridge).
type Worker struct {
	repo    Repo
	ds      *DSClient
	img     *imageGenerator
	notify  *notifier
	logger  *log.Logger
	metrics *telemetry.Metrics
	cfg     Config

	// settingsMu guards lastSettings, the most recent admin settings read
	// (see currentSettings).
	settingsMu   sync.Mutex
	lastSettings Settings

	// Pool-loop bookkeeping, touched only by the maintenance goroutine:
	// when the pool was last topped up, and the settings save it last saw
	// (a newer save tops up immediately instead of waiting out the interval).
	lastMaintain     time.Time
	lastSettingsSave time.Time

	// reentrancy guards (mirrors the Node `maintaining`, `posting`, `replying`,
	// `dmRunning` flags).
	maintainMu  sync.Mutex
	maintaining bool
	postMu      sync.Mutex
	posting     bool
	replyMu     sync.Mutex
	replying    bool
	dmMu        sync.Mutex
	dmRunning   bool

	stopOnce sync.Once
	done     chan struct{}
	wg       sync.WaitGroup
}

// New builds a Worker from worker.Deps, a DeepSeek API key, and a model name.
// The API key and model are read by run.go (via os.Getenv) before calling New.
// If apiKey is empty the worker is created but will no-op on every post tick
// (Run() already idles before calling New in that case). model defaults to
// defaultModel if empty.
func New(d worker.Deps, apiKey, model string, cfg Config) *Worker {
	var ds *DSClient
	if apiKey != "" {
		ds = newDSClient(apiKey, model)
	}
	return newWithDeps(NewPGRepo(d.DB, d.Metrics), ds, d.Logger, d.Metrics, cfg)
}

// newWithDeps is the internal constructor used by tests (accepts injected repo).
func newWithDeps(repo Repo, ds *DSClient, logger *log.Logger, metrics *telemetry.Metrics, cfg Config) *Worker {
	return &Worker{
		repo:         repo,
		ds:           ds,
		img:          newImageGenerator(ds, repo),
		notify:       newNotifier(logger),
		logger:       logger,
		metrics:      metrics,
		cfg:          cfg,
		lastSettings: cfg.Defaults,
		done:         make(chan struct{}),
	}
}

// Start launches the three ticker goroutines: pool maintenance, posting, and
// reply/DM ticks. Mirrors the Node setInterval pattern from startup().
func (w *Worker) Start(ctx context.Context) {
	s := w.currentSettings(ctx)
	w.logger.Info("bot-worker starting",
		"postTick", w.cfg.PostTick.String(),
		"createInterval", s.CreateInterval.String(),
		"target", s.TargetBotCount,
		"postRateMultiplier", s.PostRateMultiplier,
		"genConcurrency", w.cfg.GenConcurrency,
	)

	// Pool goroutine: an immediate top-up, then a once-a-minute check that
	// tops up whenever the (admin-adjustable) interval has elapsed or an
	// admin has just saved new settings.
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		w.maybeMaintain(ctx)
		ticker := time.NewTicker(settingsPollInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case <-ticker.C:
				w.maybeMaintain(ctx)
			}
		}
	}()

	// Posting goroutine.
	w.startTicker(ctx, w.cfg.PostTick, w.safePostTick)
	// Reply goroutine (reactive + proactive bot replies).
	w.startTicker(ctx, w.cfg.ReplyTick, w.safeReplyTick)
	// DM goroutine (reactive + initiated DMs + SSE notify).
	w.startTicker(ctx, w.cfg.DMTick, w.safeDmTick)

	w.logger.Info("bot-worker scheduled",
		"replyTick", w.cfg.ReplyTick.String(),
		"dmTick", w.cfg.DMTick.String(),
	)
}

// maybeMaintain runs a pool top-up when one is due under the current
// settings. Called only from the pool goroutine, so its bookkeeping needs no
// lock.
func (w *Worker) maybeMaintain(ctx context.Context) {
	s := w.currentSettings(ctx)
	now := time.Now()
	if !maintenanceDue(now, w.lastMaintain, w.lastSettingsSave, s) {
		return
	}
	w.lastMaintain = now
	w.lastSettingsSave = s.UpdatedAt
	w.safeMaintain(ctx, s)
}

// maintenanceDue reports whether the pool should be topped up now: on the
// first pass, once CreateInterval has elapsed, or when the settings row was
// saved since the last pass.
func maintenanceDue(now, lastRun, lastSave time.Time, s Settings) bool {
	if lastRun.IsZero() {
		return true
	}
	if s.UpdatedAt.After(lastSave) {
		return true
	}
	return now.Sub(lastRun) >= s.CreateInterval
}

// startTicker launches one ticker goroutine under the shared WaitGroup that
// calls fn every interval until ctx is cancelled or Stop is called.
func (w *Worker) startTicker(ctx context.Context, interval time.Duration, fn func(context.Context)) {
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-w.done:
				return
			case <-ticker.C:
				fn(ctx)
			}
		}
	}()
}

// Stop signals the ticker goroutines to exit and waits for them.
func (w *Worker) Stop() {
	w.stopOnce.Do(func() { close(w.done) })
	w.wg.Wait()
}

// safeMaintain tops up the bot pool, with a reentrancy guard (mirrors the Node
// `maintaining` flag). Panic recovery protects the supervisor process.
func (w *Worker) safeMaintain(ctx context.Context, s Settings) {
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
			w.recordJob(jobMaintain, "panic")
			w.logger.Error("bot-worker: maintainBotPool panicked", "panic", r)
		}
	}()

	if err := w.maintainBotPool(ctx, s); err != nil {
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

// maintainBotPool tops up the pool if below the target, minting at most one
// batch per pass. Mirrors Node maintainBotPool(). Lowering the target never
// deletes bots — it only stops minting.
func (w *Worker) maintainBotPool(ctx context.Context, s Settings) error {
	count, err := w.repo.CountBots(ctx)
	if err != nil {
		return fmt.Errorf("maintainBotPool: count: %w", err)
	}
	if count >= s.TargetBotCount {
		return nil
	}

	toCreate := min(s.CreateBatch, s.TargetBotCount-count)
	w.logger.Info("bot-worker: minting bots", "current", count, "target", s.TargetBotCount, "creating", toCreate)

	// Each mint is one DeepSeek call; run them with the same bounded
	// concurrency as posting so a large batch finishes in one pass.
	w.forEachLimited(ctx, toCreate, func(int) {
		if err := w.createBot(ctx); err != nil {
			w.logger.Error("bot-worker: createBot failed", "error", err)
		}
	})
	return nil
}

// forEachLimited calls fn(0..n-1) with at most cfg.GenConcurrency calls in
// flight, and returns once all have finished. Stops starting new calls once
// ctx is cancelled. Each call is panic-isolated by its caller.
func (w *Worker) forEachLimited(ctx context.Context, n int, fn func(i int)) {
	limit := max(w.cfg.GenConcurrency, 1)
	sem := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		if ctx.Err() != nil {
			break
		}
		sem <- struct{}{}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			defer func() { <-sem }()
			fn(i)
		}(i)
	}
	wg.Wait()
}

// createBot generates a persona + profile via DeepSeek and inserts a new bot
// user. Mirrors Node createBot().
func (w *Worker) createBot(ctx context.Context) error {
	if w.ds == nil {
		return fmt.Errorf("createBot: DeepSeek client not configured")
	}

	// Roll a persona across every axis (theme, voice, temperament, quirk,
	// posting habit, avatar style). The habit label lands verbatim in the
	// ACTIVITY line so shouldPost()'s regex branches fire.
	spec := rollPersona()

	profile, err := w.ds.GenerateBotProfile(ctx, spec.theme, spec.voice.label)
	if err != nil {
		return fmt.Errorf("createBot: generate profile: %w", err)
	}

	handle, err := w.uniqueHandle(ctx, profile.Handle)
	if err != nil {
		return fmt.Errorf("createBot: unique handle: %w", err)
	}

	persona := composePersona(spec)
	avatar := buildAvatarURL(handle, spec.avatarStyle)

	bio := profile.Bio
	if len([]rune(bio)) > 160 {
		bio = string([]rune(bio)[:160])
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
// MaxPostsPerTick bots, GenConcurrency at a time. Mirrors Node postTick().
func (w *Worker) postTick(ctx context.Context) error {
	if w.ds == nil {
		return nil // no-op without DeepSeek
	}
	s := w.currentSettings(ctx)
	if s.PostRateMultiplier <= 0 {
		return nil // posting paused from /admin/bots
	}

	bots, err := w.repo.LoadBots(ctx)
	if err != nil {
		return fmt.Errorf("postTick: load bots: %w", err)
	}
	if len(bots) == 0 {
		return nil
	}

	// Filter to bots that should post this tick, shuffle, cap.
	now := time.Now()
	var due []BotUser
	for _, b := range bots {
		if shouldPost(b, s.PostRateMultiplier, w.cfg.PostTick, now, rand.Float64()) {
			due = append(due, b)
		}
	}
	due = shuffle(due)
	if len(due) > s.MaxPostsPerTick {
		due = due[:s.MaxPostsPerTick]
	}

	w.forEachLimited(ctx, len(due), func(i int) { w.postAsBot(ctx, due[i]) })
	return nil
}

// postAsBot generates and inserts one post for a bot. FAILURE ISOLATION: a
// panic here is recovered so one bad generation never takes down the tick.
func (w *Worker) postAsBot(ctx context.Context, b BotUser) {
	defer func() {
		if r := recover(); r != nil {
			w.recordRun("panic")
			w.logger.Error("bot-worker: bot post panicked", "bot", b.ID, "panic", r)
		}
	}()

	content, err := w.ds.GeneratePost(ctx, b.BotPersona, randomPostShape())
	if err != nil {
		w.logger.Error("bot-worker: generate post failed", "bot", b.ID, "error", err)
		w.recordRun("error")
		return
	}
	if len(strings.TrimSpace(content)) == 0 {
		return
	}

	// Occasionally attach an AI-generated image. Never let image failure
	// block the post — fall back to text-only. Mirrors Node postTick.
	var imageURLs []string
	if isImageGenConfigured() && rand.Float64() < w.cfg.ImageProb {
		if url, ok := w.img.generatePostImage(ctx, content, b.ID); ok {
			imageURLs = []string{url}
		}
	}

	if _, err := w.repo.InsertPost(ctx, b.ID, content, imageURLs); err != nil {
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
}

// habitPostsPerDay derives a bot's base per-day post rate from its persona
// text, matching the POSTING_HABITS labels. lib/rmhark-ai/bot-stats.ts
// mirrors this for the admin page's estimate.
//
// Only the ACTIVITY line is matched when present, so a voice rule or quirk
// that happens to say "frequently" can't change a bot's pace.
func habitPostsPerDay(persona string) float64 {
	for _, line := range strings.Split(persona, "\n") {
		if strings.HasPrefix(line, "ACTIVITY:") {
			persona = line
			break
		}
	}
	switch {
	case matchPersona(persona, `very online|frequently`):
		return 9
	case matchPersona(persona, `rare poster|only chimes in`):
		return 2
	case matchPersona(persona, `flurry|goes quiet`):
		return 6
	}
	return 5
}

// shouldPost mirrors Node's shouldPost(): a per-day rate from the persona,
// scaled by the admin's posting-rate multiplier, then a minimum gap since the
// bot's last post and a probabilistic draw (rnd is a uniform [0,1) sample) so
// that on average perDay posts land across the day's ticks.
func shouldPost(bot BotUser, multiplier float64, tick time.Duration, now time.Time, rnd float64) bool {
	perDay := habitPostsPerDay(bot.BotPersona) * multiplier
	if perDay <= 0 {
		return false
	}

	if bot.BotLastPostAt != nil {
		minGap := time.Duration(float64(24*time.Hour) / (perDay*2 + 1))
		if now.Sub(*bot.BotLastPostAt) < minGap {
			return false
		}
	}

	ticksPerDay := float64(24*time.Hour) / float64(tick)
	return rnd < perDay/ticksPerDay
}

func matchPersona(persona, pattern string) bool {
	re, err := regexp.Compile("(?i)" + pattern)
	if err != nil {
		return false
	}
	return re.MatchString(persona)
}

func shuffle(bots []BotUser) []BotUser {
	out := make([]BotUser, len(bots))
	copy(out, bots)
	rand.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func (w *Worker) recordRun(outcome string) {
	w.recordJob(jobName, outcome)
}

// recordJob records a JobRuns outcome for a specific tick/job.
func (w *Worker) recordJob(job, outcome string) {
	if w.metrics != nil {
		w.metrics.JobRuns.WithLabelValues(job, outcome).Inc()
	}
}

// reservedHandles mirrors RESERVED_HANDLES in lib/handle.ts. A bot that grabs
// one of these takes it away from every human forever, since nothing else in
// the system can reclaim a handle.
var reservedHandles = map[string]bool{
	"admin": true, "api": true, "auth": true, "login": true, "signup": true,
	"register": true, "settings": true, "profile": true, "post": true,
	"messages": true, "notifications": true, "search": true, "explore": true,
	"help": true, "about": true, "terms": true, "privacy": true, "support": true,
	"feedback": true, "rmh": true, "rmhstudios": true, "mod": true,
	"moderator": true, "system": true, "null": true, "undefined": true,
	"home": true, "feed": true, "builds": true, "games": true, "blog": true,
	"research": true, "news": true,
}

// sanitizeHandle lowercases and strips non-alphanumeric chars, then forces the
// result to satisfy HANDLE_REGEX in lib/handle.ts (`^[a-z][a-z0-9_]{2,19}$`).
//
// The model is asked for a plain alphanumeric handle but happily returns things
// like "42coffee" or "admin". Those used to be inserted verbatim, producing bot
// accounts whose handle no validator would accept — an admin editing one in the
// dashboard could not save it back, and a bot could squat a reserved route name.
func sanitizeHandle(h string) string {
	var sb strings.Builder
	for _, r := range strings.ToLower(h) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			sb.WriteRune(r)
		}
	}
	result := sb.String()

	// Must start with a letter — mirrors deriveHandleBase's `u` prefix.
	if result == "" || result[0] < 'a' || result[0] > 'z' {
		result = "u" + result
	}
	if len(result) > 16 {
		result = result[:16]
	}
	if len(result) < 4 {
		result = result + "user"
	}
	// Reserved names fall through to uniqueHandle's numeric suffix, which is
	// enough to clear the collision ("admin" -> "admin417").
	if reservedHandles[result] {
		result = result + "bot"
	}
	return result
}
