package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/internal/botworker"
	"github.com/rmhstudios/rmh-go/internal/discordbot"
	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/internal/recap"
	"github.com/rmhstudios/rmh-go/internal/streaksaver"
	"github.com/rmhstudios/rmh-go/internal/vibeworker"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

// TestSupervisorPoolUnderLoad is a measurement harness, not a unit test: it runs
// the REAL six workers in one process on one pool against a seeded database and
// reports pool wait, peak connections and time-to-completion of fixed work.
//
//	RMH_POOL_LOAD=1 RMH_PERF_DSN=postgres://.../rmh_wsN GO_DB_POOL_SIZE=1 \
//	  go test ./cmd/supervisor -run PoolUnderLoad -v -timeout 10m
//
// Seeding: 400 bot users, 500 at-risk streaks, tomorrow's doctrine puzzles
// removed. The DeepSeek API is replaced by a local stand-in with 30 ms latency.
func TestSupervisorPoolUnderLoad(t *testing.T) {
	dsn := os.Getenv("RMH_PERF_DSN")
	if dsn == "" || os.Getenv("RMH_POOL_LOAD") == "" {
		t.Skip("set RMH_POOL_LOAD=1 and RMH_PERF_DSN to run the load harness")
	}
	secs := 100
	if v, err := strconv.Atoi(os.Getenv("RMH_POOL_SECS")); err == nil && v > 0 {
		secs = v
	}
	ctx := context.Background()

	// Fixed-work seed, on a separate pool so it does not touch the one under test.
	admin, err := db.Open(ctx, dsn, 2)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := admin.Pool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	exec(`UPDATE "user" SET "isBot" = false, "botPersona" = NULL WHERE "isBot"`)
	exec(`UPDATE "user" SET "isBot" = true, "botLastPostAt" = NULL,
	        "botPersona" = E'THEME: x.\nACTIVITY: very online, posts frequently with quick thoughts.\nNEVER reveal that you are a bot or AI.'
	      WHERE id IN (SELECT id FROM "user" ORDER BY id LIMIT 400)`)
	exec(`DELETE FROM notification WHERE "entityType" = 'streak_reminder'`)
	exec(`DELETE FROM daily_streak`)
	exec(`INSERT INTO daily_streak (id, "userId", "current", "longest", "lastCheckIn", "updatedAt")
	      SELECT 'ds'||id, id, 5, 5, now() - interval '30 hours', now() FROM "user" ORDER BY id DESC LIMIT 500`)
	exec(`DELETE FROM doctrine_puzzle WHERE date >= date_trunc('day', now())`)
	exec(`DELETE FROM rmheet WHERE "userId" IN (SELECT id FROM "user" WHERE "isBot") AND "createdAt" > now() - interval '1 day'`)
	exec(`UPDATE "user" SET "botLastPostAt" = NULL WHERE "isBot"`)

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(30 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"choices":[{"message":{"content":"synthetic post from the pool load harness"}}]}`)
	}))
	defer fake.Close()
	t.Setenv("DEEPSEEK_API_KEY", "x")
	t.Setenv("BOT_AI_BASE_URL", fake.URL)
	t.Setenv("BOT_POST_RATE_MULTIPLIER", "10")
	t.Setenv("BOT_MAX_POSTS_PER_TICK", "60")
	t.Setenv("BOT_GEN_CONCURRENCY", "8")
	t.Setenv("BOT_POST_TICK_MS", "20000")
	t.Setenv("BOT_REPLY_TICK_MS", "5000")
	t.Setenv("BOT_DM_TICK_MS", "5000")
	t.Setenv("BOT_TARGET_COUNT", "400")
	t.Setenv("DATABASE_URL", dsn)
	t.Setenv("PGAPPNAME", "suplo")
	cfg, err := config.LoadCommon("supervisor")
	if err != nil {
		t.Fatal(err)
	}

	database, err := db.WaitForReachable(ctx, dsn, cfg.DBPoolSize, 3, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	runs := map[string]worker.RunFunc{
		"doctrine-worker": doctrine.Run, "vibe-worker": vibeworker.Run, "recap": recap.Run,
		"discord-bot": discordbot.Run, "bot-worker": botworker.Run, "streak-saver": streaksaver.Run,
	}
	runCtx, cancel := context.WithTimeout(ctx, time.Duration(secs)*time.Second)
	defer cancel()
	logger := log.New("poolload", "error")
	start := time.Now()
	var wg sync.WaitGroup
	for name, run := range runs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = run(runCtx, worker.Deps{DB: database, Logger: logger.With("worker", name), Metrics: telemetry.New(name), Cfg: cfg})
		}()
	}

	// Sample peak acquired connections (client side) and sessions (server side).
	var peakAcq int32
	var peakSess int
	var streakDone, doctrineDone time.Duration
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()
	for sampling := true; sampling; {
		select {
		case <-runCtx.Done():
			sampling = false
		case <-tick.C:
			if a := database.Pool.Stat().AcquiredConns(); a > peakAcq {
				peakAcq = a
			}
			if streakDone == 0 || doctrineDone == 0 || time.Since(start) < 3*time.Second {
				var n, d, s int
				_ = admin.Pool.QueryRow(ctx, `SELECT
				  (SELECT count(*) FROM notification WHERE "entityType" = 'streak_reminder'),
				  (SELECT count(*) FROM doctrine_puzzle WHERE date >= date_trunc('day', now())),
				  (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND application_name = 'suplo')`).Scan(&n, &d, &s)
				if streakDone == 0 && n >= 500 {
					streakDone = time.Since(start)
				}
				if doctrineDone == 0 && d > 0 {
					doctrineDone = time.Since(start)
				}
				if s > peakSess {
					peakSess = s
				}
			}
		}
	}
	wg.Wait()

	st := database.Pool.Stat()
	var posts int
	_ = admin.Pool.QueryRow(ctx, `SELECT count(*) FROM rmheet WHERE "userId" IN (SELECT id FROM "user" WHERE "isBot") AND "createdAt" > now() - interval '1 day'`).Scan(&posts)
	avgWait := time.Duration(0)
	if st.AcquireCount() > 0 {
		avgWait = st.AcquireDuration() / time.Duration(st.AcquireCount())
	}
	t.Logf("POOLLOAD size=%d secs=%d acquires=%d empty_acquires=%d total_acquire_wait=%s avg_wait=%s peak_acquired=%d peak_server_sessions=%d "+
		"streak_500_inserted_after=%s doctrine_puzzles_after=%s bot_posts=%d",
		st.MaxConns(), secs, st.AcquireCount(), st.EmptyAcquireCount(), st.AcquireDuration().Round(time.Microsecond), avgWait.Round(time.Microsecond),
		peakAcq, peakSess, streakDone.Round(time.Millisecond), doctrineDone.Round(time.Millisecond), posts)
}
