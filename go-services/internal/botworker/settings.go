package botworker

// settings.go — the bot-worker's two layers of configuration.
//
//  1. Config: process-lifetime knobs read once from the environment through
//     pkg/config. These are the BOT_* variables documented in .env.example;
//     every one falls back to the constant in types.go, so an empty env runs
//     exactly as before.
//  2. Settings: the five knobs admins tune from /admin/bots (pool size, mint
//     batch, mint interval, posting-rate multiplier, per-tick post cap). They
//     live in the singleton "bot_worker_settings" row and are re-read on every
//     tick, so a save applies within a minute without a restart. With no row
//     saved yet, Config.Defaults (env, then constants) applies.

import (
	"context"
	"math"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/config"
)

// Settings are the admin-tunable knobs. Bounds below mirror the zod schema in
// app/routes/api/admin/bots/index.ts — keep the two in step.
type Settings struct {
	TargetBotCount     int
	CreateBatch        int
	CreateInterval     time.Duration
	PostRateMultiplier float64
	MaxPostsPerTick    int
	// UpdatedAt is the row's save time; zero when the defaults are in force.
	UpdatedAt time.Time
}

const (
	maxTargetBotCount     = 1000
	maxCreateBatch        = 50
	minCreateInterval     = 5 * time.Minute
	maxCreateInterval     = 24 * time.Hour
	maxPostRateMultiplier = 10.0
	maxPostsPerTickLimit  = 60
)

// clamp forces every field into its bounds, so a hand-edited row can never
// produce a zero-interval loop or an unbounded mint.
func (s Settings) clamp() Settings {
	s.TargetBotCount = clampInt(s.TargetBotCount, 0, maxTargetBotCount)
	s.CreateBatch = clampInt(s.CreateBatch, 1, maxCreateBatch)
	if s.CreateInterval < minCreateInterval {
		s.CreateInterval = minCreateInterval
	}
	if s.CreateInterval > maxCreateInterval {
		s.CreateInterval = maxCreateInterval
	}
	if math.IsNaN(s.PostRateMultiplier) || s.PostRateMultiplier < 0 {
		s.PostRateMultiplier = 0
	}
	if s.PostRateMultiplier > maxPostRateMultiplier {
		s.PostRateMultiplier = maxPostRateMultiplier
	}
	s.MaxPostsPerTick = clampInt(s.MaxPostsPerTick, 1, maxPostsPerTickLimit)
	return s
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// Config is everything read from the environment at startup.
type Config struct {
	// Defaults are the admin knobs' values until an admin saves the row.
	Defaults Settings

	PostTick       time.Duration
	ReplyTick      time.Duration
	DMTick         time.Duration
	GenConcurrency int
	ImageProb      float64

	ReplyLookback     time.Duration
	MaxRepliesPerTick int
	MaxReplyDepth     int
	ReactiveHumanProb float64
	BotToBotProb      float64
	ProactiveProb     float64
	ProactiveLookback time.Duration

	DMLookback            time.Duration
	MaxDMRepliesPerTick   int
	ReactiveDMProb        float64
	DMInitiateProb        float64
	MaxDMOpenersPerTick   int
	DMFollowupSilence     time.Duration
	DMActiveHumanLookback time.Duration
}

// LoadConfig reads the BOT_* environment. Variable names match .env.example
// and the retired Node worker so existing .env files keep working.
func LoadConfig() Config {
	postTick := config.GetMillis("BOT_POST_TICK_MS", postTickInterval)
	return Config{
		Defaults: Settings{
			TargetBotCount:     config.GetInt("BOT_TARGET_COUNT", targetBotCount),
			CreateBatch:        config.GetInt("BOT_CREATE_BATCH", botCreateBatch),
			CreateInterval:     config.GetMillis("BOT_USER_CHECK_MS", userCheckInterval),
			PostRateMultiplier: config.GetFloat("BOT_POST_RATE_MULTIPLIER", 1),
			MaxPostsPerTick:    config.GetInt("BOT_MAX_POSTS_PER_TICK", maxPostsPerTick),
		}.clamp(),

		PostTick:       postTick,
		ReplyTick:      config.GetMillis("BOT_REPLY_TICK_MS", postTick),
		DMTick:         config.GetMillis("BOT_DM_TICK_MS", dmTickInterval),
		GenConcurrency: clampInt(config.GetInt("BOT_GEN_CONCURRENCY", genConcurrency), 1, 16),
		ImageProb:      clampProb(config.GetFloat("BOT_IMAGE_PROBABILITY", botImageProbability)),

		ReplyLookback:     replyLookbackDuration,
		MaxRepliesPerTick: config.GetInt("BOT_MAX_REPLIES_PER_TICK", maxRepliesPerTick),
		MaxReplyDepth:     config.GetInt("BOT_MAX_REPLY_DEPTH", maxReplyDepth),
		ReactiveHumanProb: clampProb(config.GetFloat("BOT_REACTIVE_HUMAN_PROB", reactiveHumanProb)),
		BotToBotProb:      clampProb(config.GetFloat("BOT_TO_BOT_REPLY_PROB", botToBotProb)),
		ProactiveProb:     clampProb(config.GetFloat("BOT_PROACTIVE_PROB", proactiveProb)),
		ProactiveLookback: proactiveLookbackDuration,

		DMLookback:            config.GetMillis("BOT_DM_LOOKBACK_MS", dmLookbackDuration),
		MaxDMRepliesPerTick:   config.GetInt("BOT_MAX_DM_REPLIES_PER_TICK", maxDMRepliesPerTick),
		ReactiveDMProb:        clampProb(config.GetFloat("BOT_REACTIVE_DM_PROB", reactiveDMProb)),
		DMInitiateProb:        clampProb(config.GetFloat("BOT_DM_INITIATE_PROB", dmInitiateProb)),
		MaxDMOpenersPerTick:   config.GetInt("BOT_MAX_DM_OPENERS_PER_TICK", maxDMOpenersPerTick),
		DMFollowupSilence:     config.GetMillis("BOT_DM_FOLLOWUP_SILENCE_MS", dmFollowupSilenceDuration),
		DMActiveHumanLookback: config.GetMillis("BOT_DM_ACTIVE_HUMAN_LOOKBACK_MS", dmActiveHumanLookbackDuration),
	}
}

func clampProb(p float64) float64 {
	if math.IsNaN(p) || p < 0 {
		return 0
	}
	if p > 1 {
		return 1
	}
	return p
}

// currentSettings returns the live admin settings: the saved row when there is
// one, Config.Defaults otherwise. A failed read keeps the last good value so a
// DB blip never snaps a tuned worker back to defaults.
func (w *Worker) currentSettings(ctx context.Context) Settings {
	s, err := w.repo.LoadSettings(ctx)
	w.settingsMu.Lock()
	defer w.settingsMu.Unlock()
	switch {
	case err != nil:
		w.logger.Warn("bot-worker: load settings failed; keeping last known", "error", err)
	case s == nil:
		w.lastSettings = w.cfg.Defaults
	default:
		w.lastSettings = s.clamp()
	}
	return w.lastSettings
}

// scaledCount turns an expected count (e.g. 0.4 × multiplier proactive replies
// per tick) into an integer draw: the whole part always, plus one more with
// probability equal to the fractional part. rnd is a uniform [0,1) sample.
func scaledCount(expected, rnd float64) int {
	if expected <= 0 {
		return 0
	}
	whole := math.Floor(expected)
	n := int(whole)
	if rnd < expected-whole {
		n++
	}
	return n
}
