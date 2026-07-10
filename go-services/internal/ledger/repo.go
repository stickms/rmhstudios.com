package ledger

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Repo is the data-access surface for the Ledger. The interface lets tests
// inject a fake without a real database.
type Repo interface {
	InsertArtifact(ctx context.Context, a ArtifactMeta) error
	GetArtifact(ctx context.Context, id string) (ArtifactMeta, error)

	InsertRun(ctx context.Context, run PlanRun) error
	GetRun(ctx context.Context, id string) (PlanRun, error)
	GetRunByBundleID(ctx context.Context, bundleID string) (PlanRun, error)
	UpdateRunStatus(ctx context.Context, id, status string, completedAt *time.Time) error

	InsertStep(ctx context.Context, step PlanStep) error
	GetRunSteps(ctx context.Context, runID string) ([]PlanStep, error)
	UpdateStepStatus(ctx context.Context, id, status string, startedAt, completedAt *time.Time, outputArtifactID string) error

	InsertStepInputs(ctx context.Context, inputs []StepInput) error
	GetStepInputs(ctx context.Context, stepID string) ([]StepInput, error)
}

// PGRepo is the production Repo backed by pgx.
type PGRepo struct {
	db      *db.DB
	metrics *telemetry.Metrics
}

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

func (r *PGRepo) InsertArtifact(ctx context.Context, a ArtifactMeta) (err error) {
	defer func() { r.record(err) }()
	const q = `
        INSERT INTO "ledger_artifact" ("id","contentType","sizeBytes","storagePath","createdAt")
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT ("id") DO NOTHING`
	_, err = r.db.Pool.Exec(ctx, q, a.ID, a.ContentType, a.SizeBytes, a.StoragePath, a.CreatedAt)
	if err != nil {
		return fmt.Errorf("ledger repo: insert artifact: %w", err)
	}
	return nil
}

func (r *PGRepo) GetArtifact(ctx context.Context, id string) (a ArtifactMeta, err error) {
	defer func() { r.record(err) }()
	const q = `SELECT "id","contentType","sizeBytes","storagePath","createdAt"
               FROM "ledger_artifact" WHERE "id"=$1`
	row := r.db.Pool.QueryRow(ctx, q, id)
	err = row.Scan(&a.ID, &a.ContentType, &a.SizeBytes, &a.StoragePath, &a.CreatedAt)
	if err != nil {
		return a, fmt.Errorf("ledger repo: get artifact %s: %w", id, err)
	}
	return a, nil
}

func (r *PGRepo) InsertRun(ctx context.Context, run PlanRun) (err error) {
	defer func() { r.record(err) }()
	const q = `
        INSERT INTO "ledger_plan_run" ("id","bundleId","description","status","createdAt")
        VALUES ($1,$2,$3,$4,$5)`
	_, err = r.db.Pool.Exec(ctx, q, run.ID, run.BundleID, run.Description, run.Status, run.CreatedAt)
	if err != nil {
		return fmt.Errorf("ledger repo: insert run: %w", err)
	}
	return nil
}

func (r *PGRepo) GetRun(ctx context.Context, id string) (run PlanRun, err error) {
	defer func() { r.record(err) }()
	const q = `SELECT "id","bundleId","description","status","createdAt","completedAt"
               FROM "ledger_plan_run" WHERE "id"=$1`
	row := r.db.Pool.QueryRow(ctx, q, id)
	err = row.Scan(&run.ID, &run.BundleID, &run.Description, &run.Status, &run.CreatedAt, &run.CompletedAt)
	if err != nil {
		return run, fmt.Errorf("ledger repo: get run %s: %w", id, err)
	}
	return run, nil
}

func (r *PGRepo) GetRunByBundleID(ctx context.Context, bundleID string) (run PlanRun, err error) {
	defer func() { r.record(err) }()
	const q = `SELECT "id","bundleId","description","status","createdAt","completedAt"
               FROM "ledger_plan_run" WHERE "bundleId"=$1`
	row := r.db.Pool.QueryRow(ctx, q, bundleID)
	err = row.Scan(&run.ID, &run.BundleID, &run.Description, &run.Status, &run.CreatedAt, &run.CompletedAt)
	if err != nil {
		return run, fmt.Errorf("ledger repo: get run by bundle %s: %w", bundleID, err)
	}
	return run, nil
}

func (r *PGRepo) UpdateRunStatus(ctx context.Context, id, status string, completedAt *time.Time) (err error) {
	defer func() { r.record(err) }()
	const q = `UPDATE "ledger_plan_run" SET "status"=$2,"completedAt"=$3 WHERE "id"=$1`
	_, err = r.db.Pool.Exec(ctx, q, id, status, completedAt)
	if err != nil {
		return fmt.Errorf("ledger repo: update run status: %w", err)
	}
	return nil
}

func (r *PGRepo) InsertStep(ctx context.Context, s PlanStep) (err error) {
	defer func() { r.record(err) }()
	params, _ := json.Marshal(s.Params)
	const q = `
        INSERT INTO "ledger_plan_step"
            ("id","runId","stepIndex","tool","toolVersion","imageDigest","params","status","createdAt")
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`
	_, err = r.db.Pool.Exec(ctx, q,
		s.ID, s.RunID, s.StepIndex, s.Tool, s.ToolVersion,
		nullStr(s.ImageDigest), params, s.Status, s.CreatedAt)
	if err != nil {
		return fmt.Errorf("ledger repo: insert step: %w", err)
	}
	return nil
}

func (r *PGRepo) GetRunSteps(ctx context.Context, runID string) (steps []PlanStep, err error) {
	defer func() { r.record(err) }()
	const q = `
        SELECT "id","runId","stepIndex","tool","toolVersion","imageDigest",
               "params","status","startedAt","completedAt","createdAt","outputArtifactId"
        FROM "ledger_plan_step"
        WHERE "runId"=$1
        ORDER BY "stepIndex" ASC`
	rows, err := r.db.Pool.Query(ctx, q, runID)
	if err != nil {
		return nil, fmt.Errorf("ledger repo: get steps: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var s PlanStep
		var imgDigest *string
		var outputArtifact *string
		if err = rows.Scan(&s.ID, &s.RunID, &s.StepIndex, &s.Tool, &s.ToolVersion,
			&imgDigest, &s.Params, &s.Status,
			&s.StartedAt, &s.CompletedAt, &s.CreatedAt, &outputArtifact); err != nil {
			return nil, fmt.Errorf("ledger repo: scan step: %w", err)
		}
		if imgDigest != nil {
			s.ImageDigest = *imgDigest
		}
		if outputArtifact != nil {
			s.OutputArtifactID = *outputArtifact
		}
		steps = append(steps, s)
	}
	return steps, rows.Err()
}

func (r *PGRepo) UpdateStepStatus(ctx context.Context, id, status string, startedAt, completedAt *time.Time, outputArtifactID string) (err error) {
	defer func() { r.record(err) }()
	const q = `UPDATE "ledger_plan_step"
               SET "status"=$2,"startedAt"=$3,"completedAt"=$4,"outputArtifactId"=$5
               WHERE "id"=$1`
	_, err = r.db.Pool.Exec(ctx, q, id, status, startedAt, completedAt, nullStr(outputArtifactID))
	if err != nil {
		return fmt.Errorf("ledger repo: update step status: %w", err)
	}
	return nil
}

func (r *PGRepo) InsertStepInputs(ctx context.Context, inputs []StepInput) (err error) {
	defer func() { r.record(err) }()
	for _, inp := range inputs {
		const q = `INSERT INTO "ledger_step_input" ("stepId","artifactId","role")
                   VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`
		if _, err = r.db.Pool.Exec(ctx, q, inp.StepID, inp.ArtifactID, inp.Role); err != nil {
			return fmt.Errorf("ledger repo: insert step input: %w", err)
		}
	}
	return nil
}

func (r *PGRepo) GetStepInputs(ctx context.Context, stepID string) (inputs []StepInput, err error) {
	defer func() { r.record(err) }()
	const q = `SELECT "stepId","artifactId","role" FROM "ledger_step_input" WHERE "stepId"=$1`
	rows, err := r.db.Pool.Query(ctx, q, stepID)
	if err != nil {
		return nil, fmt.Errorf("ledger repo: get step inputs: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var inp StepInput
		if err = rows.Scan(&inp.StepID, &inp.ArtifactID, &inp.Role); err != nil {
			return nil, fmt.Errorf("ledger repo: scan step input: %w", err)
		}
		inputs = append(inputs, inp)
	}
	return inputs, rows.Err()
}

// nullStr converts empty string to nil for nullable TEXT columns.
func nullStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
