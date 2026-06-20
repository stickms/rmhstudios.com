package ledger

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Service coordinates artifact storage and provenance recording.
type Service struct {
	store   *Store
	repo    Repo
	logger  *log.Logger
	metrics *telemetry.Metrics
}

// New builds a Service from an artifact store, repo, logger, and metrics.
func New(store *Store, repo Repo, logger *log.Logger, metrics *telemetry.Metrics) *Service {
	return &Service{store: store, repo: repo, logger: logger, metrics: metrics}
}

// WriteArtifact streams content into the artifact store, computes its SHA-256
// identity, persists metadata to Postgres, and returns the ArtifactMeta.
// Writing the same bytes twice is idempotent.
func (s *Service) WriteArtifact(ctx context.Context, r io.Reader, contentType string) (ArtifactMeta, error) {
	id, n, err := s.store.Put(ctx, r)
	if err != nil {
		return ArtifactMeta{}, fmt.Errorf("ledger: write artifact: %w", err)
	}
	storagePath, err := s.store.StoragePath(id)
	if err != nil {
		return ArtifactMeta{}, err
	}
	a := ArtifactMeta{
		ID:          id,
		ContentType: contentType,
		SizeBytes:   n,
		StoragePath: storagePath,
		CreatedAt:   time.Now().UTC(),
	}
	if err = s.repo.InsertArtifact(ctx, a); err != nil {
		return ArtifactMeta{}, err
	}
	s.logger.Info("ledger: artifact written", "id", id, "contentType", contentType, "bytes", n)
	return a, nil
}

// ReadArtifact returns metadata and a content reader for an artifact.
// The caller must close the reader.
func (s *Service) ReadArtifact(ctx context.Context, id string) (ArtifactMeta, io.ReadCloser, error) {
	meta, err := s.repo.GetArtifact(ctx, id)
	if err != nil {
		return ArtifactMeta{}, nil, err
	}
	rc, err := s.store.Get(ctx, id)
	if err != nil {
		return ArtifactMeta{}, nil, err
	}
	return meta, rc, nil
}

// GetArtifactMeta returns only the metadata for an artifact (no content).
func (s *Service) GetArtifactMeta(ctx context.Context, id string) (ArtifactMeta, error) {
	return s.repo.GetArtifact(ctx, id)
}

// CreateRun starts a new plan run and persists it.
func (s *Service) CreateRun(ctx context.Context, description string) (PlanRun, error) {
	run := PlanRun{
		ID:          uuid.New().String(),
		BundleID:    newBundleID(),
		Description: description,
		Status:      "pending",
		CreatedAt:   time.Now().UTC(),
	}
	if err := s.repo.InsertRun(ctx, run); err != nil {
		return PlanRun{}, err
	}
	s.logger.Info("ledger: run created", "bundleId", run.BundleID)
	return run, nil
}

// GetRun returns a run and all its steps (with inputs populated).
func (s *Service) GetRun(ctx context.Context, id string) (PlanRun, []PlanStep, error) {
	run, err := s.repo.GetRun(ctx, id)
	if err != nil {
		return PlanRun{}, nil, err
	}
	steps, err := s.repo.GetRunSteps(ctx, id)
	if err != nil {
		return PlanRun{}, nil, err
	}
	for i := range steps {
		steps[i].Inputs, err = s.repo.GetStepInputs(ctx, steps[i].ID)
		if err != nil {
			return PlanRun{}, nil, err
		}
	}
	return run, steps, nil
}

// GetRunByBundleID is like GetRun but looks up by the human-readable bundle ID.
func (s *Service) GetRunByBundleID(ctx context.Context, bundleID string) (PlanRun, []PlanStep, error) {
	run, err := s.repo.GetRunByBundleID(ctx, bundleID)
	if err != nil {
		return PlanRun{}, nil, err
	}
	return s.GetRun(ctx, run.ID)
}

// RecordStepRequest is the input to RecordStep.
type RecordStepRequest struct {
	RunID            string
	StepIndex        int
	Tool             string
	ToolVersion      string
	ImageDigest      string          // optional
	Params           json.RawMessage
	OutputArtifactID string          // optional; set once step completes
	Inputs           []StepInput
}

// RecordStep persists a pipeline step and its input edges to the provenance DAG.
func (s *Service) RecordStep(ctx context.Context, req RecordStepRequest) (PlanStep, error) {
	now := time.Now().UTC()
	step := PlanStep{
		ID:               uuid.New().String(),
		RunID:            req.RunID,
		StepIndex:        req.StepIndex,
		Tool:             req.Tool,
		ToolVersion:      req.ToolVersion,
		ImageDigest:      req.ImageDigest,
		Params:           req.Params,
		Status:           "completed",
		CompletedAt:      &now,
		CreatedAt:        now,
		OutputArtifactID: req.OutputArtifactID,
	}
	if err := s.repo.InsertStep(ctx, step); err != nil {
		return PlanStep{}, err
	}
	for i := range req.Inputs {
		req.Inputs[i].StepID = step.ID
	}
	if len(req.Inputs) > 0 {
		if err := s.repo.InsertStepInputs(ctx, req.Inputs); err != nil {
			return PlanStep{}, err
		}
	}
	step.Inputs = req.Inputs
	s.logger.Info("ledger: step recorded",
		"runId", req.RunID, "stepIndex", req.StepIndex,
		"tool", req.Tool, "version", req.ToolVersion)
	return step, nil
}

// CompleteRun marks a run as completed.
func (s *Service) CompleteRun(ctx context.Context, id string) error {
	now := time.Now().UTC()
	return s.repo.UpdateRunStatus(ctx, id, "completed", &now)
}

// FailRun marks a run as failed.
func (s *Service) FailRun(ctx context.Context, id string) error {
	now := time.Now().UTC()
	return s.repo.UpdateRunStatus(ctx, id, "failed", &now)
}

// newBundleID generates "run-YYYYMMDD-HHMMSS-xxxxxx" (6 random chars).
func newBundleID() string {
	const charset = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[rand.IntN(len(charset))]
	}
	return fmt.Sprintf("run-%s-%s", time.Now().UTC().Format("20060102-150405"), string(b))
}
