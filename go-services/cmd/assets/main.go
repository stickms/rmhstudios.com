// go-services/cmd/assets/main.go
//
// Command assets serves /library, /music, /models, /sprites by streaming objects
// from the S3-compatible bucket. It replaces the Apache-off-disk static CDN for
// those prefixes. Exposes /health and /metrics on ASSETS_PORT.
package main

import (
	"context"
	"net/http"
	"time"

	"github.com/rmhstudios/rmh-go/internal/assets"
	"github.com/rmhstudios/rmh-go/pkg/config"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/objectstore"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func main() {
	cfg, err := config.LoadCommon("assets")
	logger := log.New("assets", cfg.LogLevel)
	if err != nil {
		logger.Fatal("config", "error", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	store, err := objectstore.New(ctx)
	if err != nil {
		logger.Fatal("objectstore", "error", err)
	}

	metrics := telemetry.New("assets")

	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health("assets", nil))
	mux.Handle("/metrics", metrics.Handler())
	// The four media prefixes route here; everything else 404s.
	mux.Handle("/library/", assets.NewHandler(store, logger))
	mux.Handle("/music/", assets.NewHandler(store, logger))
	mux.Handle("/models/", assets.NewHandler(store, logger))
	mux.Handle("/sprites/", assets.NewHandler(store, logger))

	addr := ":" + config.GetString("ASSETS_PORT", "7007")
	srv := httpx.NewServer(addr, mux, logger)
	if err := srv.Run(30 * time.Second); err != nil {
		logger.Error("server", "error", err)
	}
	cancel()
}
