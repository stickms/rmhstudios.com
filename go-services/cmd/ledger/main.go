// Command ledger is the Ledger HTTP service — the Co-Scientist's
// reproducibility substrate. It exposes a content-addressed artifact store
// and a provenance DAG over a small REST API at LEDGER_ADDR (default :7100).
package main

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/rmhstudios/rmh-go/internal/ledger"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("ledger")
	logger := log.New("ledger", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	database, err := db.WaitForReachable(ctx, cfg.DatabaseURL, 10, 5*time.Second)
	if err != nil {
		logger.Fatal("db", "error", err)
	}
	defer database.Close()

	metrics := telemetry.New("ledger")

	ledgerAddr := config.GetString("LEDGER_ADDR", ":7100")
	artifactDir := config.GetString("LEDGER_ARTIFACT_DIR", defaultArtifactDir(logger))

	store, err := ledger.NewStore(artifactDir)
	if err != nil {
		logger.Fatal("artifact store", "error", err)
	}

	repo := ledger.NewPGRepo(database, metrics)
	svc := ledger.New(store, repo, logger, metrics)
	h := ledger.NewHandler(svc, logger)

	// Metrics + health on cfg.MetricsAddr (probed by k8s separately).
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/health", httpx.Health("ledger", nil))
		mux.Handle("/metrics", metrics.Handler())
		if err := http.ListenAndServe(cfg.MetricsAddr, mux); err != nil {
			logger.Fatal("metrics server", "error", err)
		}
	}()

	// Ledger API on ledgerAddr.
	mux := http.NewServeMux()
	h.RegisterRoutes(mux)
	srv := httpx.NewServer(ledgerAddr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
		os.Exit(1)
	}
}

// defaultArtifactDir returns <cwd>/db/ledger-artifacts, matching the
// vibe-thumbs convention for shared-volume mounts.
func defaultArtifactDir(logger *log.Logger) string {
	cwd, err := os.Getwd()
	if err != nil {
		logger.Fatal("cwd", "error", err)
	}
	return filepath.Join(cwd, "db", "ledger-artifacts")
}
