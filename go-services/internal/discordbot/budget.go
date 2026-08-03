// budget.go is the bot's only database dependency: the shared daily ceiling on
// xAI image spend. It is the same "image_gen_budget" row the bot-worker reserves
// against, in the same atomic form, so the two processes share ONE daily cap
// rather than two that each look reasonable and together overspend.
//
// A nil *db.DB (no database configured — local runs without Postgres) makes the
// reservation fail closed: no database means no accounting, and unaccounted
// image spend is exactly what this exists to prevent.
package discordbot

import (
	"context"
	"errors"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/rmhstudios/rmh-go/pkg/db"
)

var (
	// errBudgetExhausted is returned when today's cap is already spent, so the
	// handler can say "come back tomorrow" instead of reporting a generic failure.
	errBudgetExhausted = errors.New("daily image budget exhausted")
	// errBudgetUnavailable is the no-database case. Kept distinct from
	// exhaustion: "today's budget is spent" would be a lie in a local run with
	// no Postgres, and the fix is a different one.
	errBudgetUnavailable = errors.New("image budget accounting is unavailable (no database configured)")
)

// imageBudget is the ceiling the renderer checks before it spends anything.
// An interface only so the render path can be exercised without a Postgres —
// *budgetRepo is the one production implementation.
type imageBudget interface {
	// available reports whether spend can be accounted for at all.
	available() bool
	// reserve takes one unit for the given UTC day, returning false at cap.
	reserve(ctx context.Context, day string, capLimit int) (bool, error)
}

type budgetRepo struct {
	db *db.DB
}

func newBudgetRepo(database *db.DB) *budgetRepo { return &budgetRepo{db: database} }

var _ imageBudget = (*budgetRepo)(nil)

func (r *budgetRepo) available() bool { return r != nil && r.db != nil }

// reserveImageBudgetQuery atomically reserves one unit of today's global image
// budget, returning the new count iff still under cap. The WHERE on the DO
// UPDATE is what makes it atomic: at cap the update matches nothing and the
// statement returns no rows, so two concurrent callers cannot both squeeze past
// the ceiling.
const reserveImageBudgetQuery = `
INSERT INTO "image_gen_budget" (day, count) VALUES ($1, 1)
ON CONFLICT (day) DO UPDATE
  SET count = "image_gen_budget".count + 1
  WHERE "image_gen_budget".count < $2
RETURNING count`

// reserve takes one image-generation unit for the given UTC day. Fails closed
// (false) on a missing database or at cap; returns the error only when the query
// itself failed, so the caller can tell "over budget" from "database down".
func (r *budgetRepo) reserve(ctx context.Context, day string, capLimit int) (bool, error) {
	if r == nil || r.db == nil {
		return false, nil
	}
	var count int
	err := r.db.Pool.QueryRow(ctx, reserveImageBudgetQuery, day, capLimit).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // at cap
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// imageDailyCap resolves XAI_IMAGE_DAILY_CAP (default 50), shared with the
// bot-worker's own reader so the two agree on the ceiling.
func imageDailyCap() int {
	if n, err := strconv.Atoi(os.Getenv("XAI_IMAGE_DAILY_CAP")); err == nil && n > 0 {
		return n
	}
	return 50
}

// imageGenerationEnabled reports the fleet-wide kill switch: XAI_IMAGE_ENABLED
// set to "false" hard-disables all generation.
func imageGenerationEnabled() bool {
	return os.Getenv("XAI_IMAGE_ENABLED") != "false"
}
