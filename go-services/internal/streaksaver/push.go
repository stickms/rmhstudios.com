package streaksaver

// push.go — mirror streak reminders to web push via the web tier's internal
// endpoint, which owns the VAPID/web-push pipeline. The worker writes the
// in-app notification itself (run.go) and delegates push here so we don't
// re-implement RFC 8291 encryption or pull a web-push dependency into the fleet.
//
// Best-effort: disabled when INTERNAL_API_SECRET is unset (mirroring the
// bot-worker SSE bridge), and any failure is logged, never returned.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
)

type reminder struct {
	UserID  string `json:"userId"`
	Current int    `json:"current"`
}

var pushClient = &http.Client{Timeout: 5 * time.Second}

// internalAPIBase resolves the web origin: INTERNAL_API_URL, else the origin of
// BETTER_AUTH_URL, else a localhost default. Mirrors bot-worker's resolver.
func internalAPIBase() string {
	if v := os.Getenv("INTERNAL_API_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	if a := os.Getenv("BETTER_AUTH_URL"); a != "" {
		if u, err := url.Parse(a); err == nil && u.Scheme != "" && u.Host != "" {
			return u.Scheme + "://" + u.Host
		}
	}
	return "http://127.0.0.1:7005"
}

func pushReminders(ctx context.Context, logger *log.Logger, reminders []reminder) {
	if len(reminders) == 0 {
		return
	}
	secret := os.Getenv("INTERNAL_API_SECRET")
	if secret == "" {
		logger.Debug("streak-saver: push bridge disabled (INTERNAL_API_SECRET unset)")
		return
	}
	body, err := json.Marshal(struct {
		Reminders []reminder `json:"reminders"`
	}{Reminders: reminders})
	if err != nil {
		logger.Warn("streak-saver: build push body failed", "error", err)
		return
	}

	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, internalAPIBase()+"/api/internal/streak-push", bytes.NewReader(body))
	if err != nil {
		logger.Warn("streak-saver: build push request failed", "error", err)
		return
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-internal-secret", secret)

	resp, err := pushClient.Do(req)
	if err != nil {
		logger.Warn("streak-saver: push bridge failed", "error", err)
		return
	}
	_ = resp.Body.Close()
}
