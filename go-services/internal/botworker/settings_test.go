package botworker

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestSettingsClamp(t *testing.T) {
	got := Settings{
		TargetBotCount:     -5,
		CreateBatch:        0,
		CreateInterval:     time.Second,
		PostRateMultiplier: 99,
		MaxPostsPerTick:    0,
	}.clamp()
	if got.TargetBotCount != 0 || got.CreateBatch != 1 || got.CreateInterval != minCreateInterval ||
		got.PostRateMultiplier != maxPostRateMultiplier || got.MaxPostsPerTick != 1 {
		t.Errorf("low/high values not clamped: %+v", got)
	}
	got = Settings{TargetBotCount: 1e6, CreateBatch: 1e6, CreateInterval: 1e6 * time.Hour, MaxPostsPerTick: 1e6}.clamp()
	if got.TargetBotCount != maxTargetBotCount || got.CreateBatch != maxCreateBatch ||
		got.CreateInterval != maxCreateInterval || got.MaxPostsPerTick != maxPostsPerTickLimit {
		t.Errorf("upper bounds not clamped: %+v", got)
	}
}

func TestLoadConfigDefaultsAndEnv(t *testing.T) {
	for _, k := range []string{"BOT_TARGET_COUNT", "BOT_POST_TICK_MS", "BOT_REPLY_TICK_MS", "BOT_POST_RATE_MULTIPLIER", "BOT_IMAGE_PROBABILITY"} {
		t.Setenv(k, "")
	}
	cfg := LoadConfig()
	if cfg.Defaults.TargetBotCount != targetBotCount || cfg.PostTick != postTickInterval ||
		cfg.Defaults.PostRateMultiplier != 1 || cfg.ImageProb != botImageProbability {
		t.Errorf("empty env should give built-in defaults: %+v", cfg)
	}

	t.Setenv("BOT_TARGET_COUNT", "75")
	t.Setenv("BOT_POST_TICK_MS", "120000")
	t.Setenv("BOT_POST_RATE_MULTIPLIER", "2.5")
	t.Setenv("BOT_IMAGE_PROBABILITY", "7") // out of range → clamped
	cfg = LoadConfig()
	if cfg.Defaults.TargetBotCount != 75 || cfg.PostTick != 2*time.Minute ||
		cfg.Defaults.PostRateMultiplier != 2.5 || cfg.ImageProb != 1 {
		t.Errorf("env overrides not applied: %+v", cfg)
	}
	// The reply tick follows the post tick unless set on its own.
	if cfg.ReplyTick != 2*time.Minute {
		t.Errorf("ReplyTick = %v, want post tick", cfg.ReplyTick)
	}
}

func TestMaintenanceDue(t *testing.T) {
	now := time.Now()
	s := Settings{CreateInterval: time.Hour, UpdatedAt: now.Add(-2 * time.Hour)}
	if !maintenanceDue(now, time.Time{}, time.Time{}, s) {
		t.Error("first pass must run")
	}
	if maintenanceDue(now, now.Add(-10*time.Minute), s.UpdatedAt, s) {
		t.Error("must wait out the interval")
	}
	if !maintenanceDue(now, now.Add(-61*time.Minute), s.UpdatedAt, s) {
		t.Error("must run once the interval has elapsed")
	}
	saved := s
	saved.UpdatedAt = now.Add(-time.Minute)
	if !maintenanceDue(now, now.Add(-10*time.Minute), s.UpdatedAt, saved) {
		t.Error("a fresh admin save must trigger a top-up immediately")
	}
}

func TestScaledCount(t *testing.T) {
	cases := []struct {
		expected, rnd float64
		want          int
	}{
		{0, 0, 0},
		{0.4, 0.39, 1},
		{0.4, 0.41, 0},
		{2.5, 0.49, 3},
		{2.5, 0.51, 2},
		{3, 0.99, 3},
	}
	for _, c := range cases {
		if got := scaledCount(c.expected, c.rnd); got != c.want {
			t.Errorf("scaledCount(%v, %v) = %d, want %d", c.expected, c.rnd, got, c.want)
		}
	}
}

func TestForEachLimitedBoundsConcurrency(t *testing.T) {
	w := &Worker{cfg: Config{GenConcurrency: 3}}
	var inFlight, peak, calls atomic.Int32
	w.forEachLimited(context.Background(), 20, func(int) {
		n := inFlight.Add(1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		time.Sleep(5 * time.Millisecond)
		inFlight.Add(-1)
		calls.Add(1)
	})
	if calls.Load() != 20 {
		t.Errorf("calls = %d, want 20", calls.Load())
	}
	if peak.Load() > 3 {
		t.Errorf("peak concurrency = %d, want ≤ 3", peak.Load())
	}
}

func TestPostUserPromptCarriesShape(t *testing.T) {
	got := postUserPrompt("THEME: coffee.", "a question to their followers")
	if want := "a question to their followers"; !strings.Contains(got, want) {
		t.Errorf("post prompt missing shape: %q", got)
	}
}
