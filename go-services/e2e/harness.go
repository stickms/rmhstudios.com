//go:build e2e

// Package e2e contains end-to-end tests that dial the actual running service
// binaries over websockets and assert the real protocol flows. They are gated
// behind the `e2e` build tag and read all connection info from the environment
// (see scripts/e2e/run.sh for the orchestration that starts Postgres + the
// binaries before invoking `go test -tags e2e ./e2e/...`).
package e2e

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// ─── env getters ─────────────────────────────────────────────────────────────

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// gamehubURL is the gamehub websocket endpoint (the hub is mounted at /socket/).
func gamehubURL() string { return env("E2E_GAMEHUB_URL", "ws://localhost:7001/socket/") }

// rmhtubeURL is the rmhtube websocket endpoint (the hub is mounted at /rmhtube-ws/).
func rmhtubeURL() string { return env("E2E_RMHTUBE_URL", "ws://localhost:7003/rmhtube-ws/") }

// databaseURL is the Postgres DSN used by the auth/persistence tests. Empty when
// no DB is available (those tests t.Skip in that case).
func databaseURL() string { return os.Getenv("E2E_DATABASE_URL") }

// ─── websocket client ────────────────────────────────────────────────────────

// defaultReadTimeout bounds every readUntil call so a missing/wrong event fails
// the test instead of hanging.
const defaultReadTimeout = 5 * time.Second

// client wraps a single websocket connection to a hub, speaking the realtime
// JSON envelope protocol ({event, payload, seq, ts}).
type client struct {
	t  *testing.T
	ws *websocket.Conn
}

// dial opens a websocket to rawURL. token, when non-empty, is appended as the
// ?token= query param (the hub resolves identity from it; see hub.ServeWS).
func dial(t *testing.T, rawURL, token string) *client {
	t.Helper()
	if token != "" {
		if containsQuery(rawURL) {
			rawURL += "&token=" + token
		} else {
			rawURL += "?token=" + token
		}
	}
	ws, resp, err := websocket.DefaultDialer.Dial(rawURL, nil)
	if err != nil {
		status := ""
		if resp != nil {
			status = " (http " + resp.Status + ")"
		}
		t.Fatalf("dial %s: %v%s", rawURL, err, status)
	}
	c := &client{t: t, ws: ws}
	t.Cleanup(c.close)
	return c
}

func containsQuery(u string) bool {
	for i := 0; i < len(u); i++ {
		if u[i] == '?' {
			return true
		}
	}
	return false
}

// send marshals payload into an envelope and writes it to the socket.
func (c *client) send(event string, payload any) {
	c.t.Helper()
	e := realtime.MustEnvelope(event, payload)
	if err := c.ws.WriteMessage(websocket.TextMessage, e.Encode()); err != nil {
		c.t.Fatalf("send %s: %v", event, err)
	}
}

// readUntil reads frames until one whose Event == event arrives, returning its
// decoded payload as a generic map. It fails the test on timeout. Frames for
// other events (heartbeats, unrelated broadcasts) are skipped.
func (c *client) readUntil(event string, timeout time.Duration) map[string]any {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			c.t.Fatalf("timed out waiting for event %q", event)
		}
		_ = c.ws.SetReadDeadline(deadline)
		_, raw, err := c.ws.ReadMessage()
		if err != nil {
			c.t.Fatalf("read while waiting for %q: %v", event, err)
		}
		env, err := realtime.Decode(raw)
		if err != nil {
			continue // ignore malformed frames
		}
		if env.Event != event {
			continue
		}
		var p map[string]any
		if len(env.Payload) > 0 {
			if err := json.Unmarshal(env.Payload, &p); err != nil {
				c.t.Fatalf("decode payload for %q: %v", event, err)
			}
		}
		if p == nil {
			p = map[string]any{}
		}
		return p
	}
}

// expectNoEvent asserts that event does NOT arrive within timeout. Used to prove
// a relay does not leak to the wrong peer.
func (c *client) expectNoEvent(event string, timeout time.Duration) {
	c.t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			return // good: nothing arrived
		}
		_ = c.ws.SetReadDeadline(deadline)
		_, raw, err := c.ws.ReadMessage()
		if err != nil {
			return // read error / timeout — treat as "nothing of interest arrived"
		}
		env, derr := realtime.Decode(raw)
		if derr != nil {
			continue
		}
		if env.Event == event {
			c.t.Fatalf("did not expect event %q but received it", event)
		}
	}
}

func (c *client) close() {
	if c.ws != nil {
		_ = c.ws.Close()
	}
}

// str pulls a string field from a decoded payload, failing the test if absent.
func str(t *testing.T, m map[string]any, key string) string {
	t.Helper()
	v, ok := m[key]
	if !ok {
		t.Fatalf("expected key %q in payload %v", key, m)
	}
	s, ok := v.(string)
	if !ok {
		t.Fatalf("expected key %q to be a string, got %T (%v)", key, v, v)
	}
	return s
}
