// Package oncall sends heartbeats and alarms to the on-call watchdog
// (deploy/oncall-watchdog), which pages @oncall in Discord.
//
// Requests are HMAC-signed with a timestamp and a one-time nonce, exactly as
// deploy/oncall-watchdog/src/signing.ts verifies them:
//
//	X-Oncall-Signature: v1=hex(HMAC-SHA256(secret, "v1:<ts>:<nonce>:<METHOD>:<path>:<body>"))
//
// A nil or unconfigured *Client is a no-op, so callers never branch on whether
// on-call is set up yet.
package oncall

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// MinSecretLength matches the Worker's floor; a shorter secret is treated as unset.
const MinSecretLength = 32

// Client posts to one watchdog.
type Client struct {
	baseURL string
	secret  string
	http    *http.Client
	now     func() time.Time
}

// New returns a client, or nil when url/secret are missing or the secret is
// too short (on-call not configured — every method then does nothing).
func New(url, secret string) *Client {
	url = strings.TrimRight(strings.TrimSpace(url), "/")
	if !strings.HasPrefix(url, "https://") && !strings.HasPrefix(url, "http://") {
		return nil
	}
	if len(secret) < MinSecretLength {
		return nil
	}
	return &Client{baseURL: url, secret: secret, http: &http.Client{Timeout: 10 * time.Second}, now: time.Now}
}

// Alert is one alarm transition. Sev 1 is rejected by the watchdog: humans
// escalate to Sev1, alarms never do.
type Alert struct {
	State    string `json:"state"` // "firing" | "resolved"
	ID       string `json:"id"`
	Instance string `json:"instance,omitempty"`
	Sev      int    `json:"sev"`
	Title    string `json:"title"`
	Detail   string `json:"detail,omitempty"`
	Runbook  string `json:"runbook,omitempty"`
	Source   string `json:"source"`
}

// Heartbeat checks in under name; the watchdog pages when check-ins stop.
func (c *Client) Heartbeat(ctx context.Context, name string) error {
	if c == nil {
		return nil
	}
	return c.do(ctx, http.MethodPost, "/v1/heartbeat/"+name, nil)
}

// Send raises or clears an alarm.
func (c *Client) Send(ctx context.Context, a Alert) error {
	if c == nil {
		return nil
	}
	body, err := json.Marshal(a)
	if err != nil {
		return err
	}
	return c.do(ctx, http.MethodPost, "/v1/alert", body)
}

// Sign returns the signature header value for one request (exported for tests
// and for the cross-language vector shared with signing.ts).
func Sign(secret, ts, nonce, method, path string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	fmt.Fprintf(mac, "v1:%s:%s:%s:%s:", ts, nonce, strings.ToUpper(method), path)
	mac.Write(body)
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) do(ctx context.Context, method, path string, body []byte) error {
	var last error
	for attempt := 0; attempt < 2; attempt++ {
		// Re-signed per attempt: if a first try reached the Worker but its
		// response was lost, that nonce is already spent.
		var n [16]byte
		if _, err := rand.Read(n[:]); err != nil {
			return err
		}
		nonce := hex.EncodeToString(n[:])
		ts := strconv.FormatInt(c.now().Unix(), 10)

		req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "rmh-oncall-client/1")
		req.Header.Set("X-Oncall-Timestamp", ts)
		req.Header.Set("X-Oncall-Nonce", nonce)
		req.Header.Set("X-Oncall-Signature", Sign(c.secret, ts, nonce, method, path, body))

		resp, err := c.http.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 300 {
				return nil
			}
			last = fmt.Errorf("oncall: %s %s: HTTP %d", method, path, resp.StatusCode)
			if resp.StatusCode < 500 {
				return last // a 4xx won't fix itself on retry
			}
		} else {
			last = err
		}
		if attempt == 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(2 * time.Second):
			}
		}
	}
	return last
}
