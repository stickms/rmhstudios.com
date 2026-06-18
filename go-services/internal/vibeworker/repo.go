package vibeworker

import (
	"context"
	"fmt"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// PGRepo is the production Repo backed by the shared pgx pool.
type PGRepo struct {
	db      *db.DB
	metrics *telemetry.Metrics
}

// NewPGRepo wraps a *db.DB as a Repo.
func NewPGRepo(database *db.DB, metrics *telemetry.Metrics) *PGRepo {
	return &PGRepo{db: database, metrics: metrics}
}

func (r *PGRepo) record(err error) {
	if r.metrics == nil {
		return
	}
	if err != nil {
		r.metrics.DBQueries.WithLabelValues("error").Inc()
	} else {
		r.metrics.DBQueries.WithLabelValues("ok").Inc()
	}
}

// SelectStale returns up to limit stale pages, oldest first. Ports the Node
// prisma.vibePage.findMany({ where: thumbnailStale, orderBy updatedAt asc }).
func (r *PGRepo) SelectStale(ctx context.Context, limit int) (pages []StalePage, err error) {
	defer func() { r.record(err) }()

	const q = `SELECT "id", "slug", "html", "updatedAt"
	             FROM "vibe_page"
	            WHERE "thumbnailStale" = true
	         ORDER BY "updatedAt" ASC
	            LIMIT $1`
	rows, err := r.db.Pool.Query(ctx, q, limit)
	if err != nil {
		return nil, fmt.Errorf("vibeworker: select stale: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var p StalePage
		if err = rows.Scan(&p.ID, &p.Slug, &p.HTML, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("vibeworker: scan stale row: %w", err)
		}
		pages = append(pages, p)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("vibeworker: iterate stale rows: %w", err)
	}
	return pages, nil
}

// ClearStale performs the optimistic-concurrency update: clear the flag and set
// the URL only when "updatedAt" is unchanged since the row was read.
func (r *PGRepo) ClearStale(ctx context.Context, id, thumbnailURL string, expectedUpdatedAt time.Time) (cleared bool, err error) {
	defer func() { r.record(err) }()

	const q = `UPDATE "vibe_page"
	              SET "thumbnailStale" = false, "thumbnailUrl" = $1
	            WHERE "id" = $2 AND "updatedAt" = $3`
	tag, err := r.db.Pool.Exec(ctx, q, thumbnailURL, id, expectedUpdatedAt)
	if err != nil {
		return false, fmt.Errorf("vibeworker: clear stale: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// SetThumbnailURL records a URL without clearing the stale flag (mid-render
// change path).
func (r *PGRepo) SetThumbnailURL(ctx context.Context, id, thumbnailURL string) (err error) {
	defer func() { r.record(err) }()

	const q = `UPDATE "vibe_page" SET "thumbnailUrl" = $1 WHERE "id" = $2`
	if _, err = r.db.Pool.Exec(ctx, q, thumbnailURL, id); err != nil {
		return fmt.Errorf("vibeworker: set thumbnail url: %w", err)
	}
	return nil
}
