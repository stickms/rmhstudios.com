package ledger

import (
	"encoding/json"
	"time"
)

// ArtifactMeta is the database record for a content-addressed artifact.
// The content itself lives on the filesystem under the artifact root.
type ArtifactMeta struct {
	ID          string    // "sha256:<hex64>"
	ContentType string
	SizeBytes   int64
	StoragePath string    // relative: "<hex[:2]>/<hex64>"
	CreatedAt   time.Time
}

// PlanRun is a bundle of pipeline steps forming one reproducible analysis.
type PlanRun struct {
	ID          string
	BundleID    string    // "run-YYYYMMDD-HHMMSS-xxxxxx"
	Description string
	Status      string    // pending | running | completed | failed
	CreatedAt   time.Time
	CompletedAt *time.Time
}

// RerunCmd returns the CLI command to reproduce this run.
func (r PlanRun) RerunCmd() string {
	return "rmhtech rerun " + r.BundleID
}

// PlanStep is one tool invocation within a PlanRun.
type PlanStep struct {
	ID               string
	RunID            string
	StepIndex        int
	Tool             string
	ToolVersion      string
	ImageDigest      string
	Params           json.RawMessage
	Status           string    // pending | running | completed | failed | cached
	StartedAt        *time.Time
	CompletedAt      *time.Time
	CreatedAt        time.Time
	OutputArtifactID string
	Inputs           []StepInput
}

// StepInput records which artifact played which role as input to a step.
type StepInput struct {
	StepID     string
	ArtifactID string
	Role       string // "fastq" | "genome_index" | "count_matrix" | ...
}
