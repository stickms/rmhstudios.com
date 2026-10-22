package oncall

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

const secret = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" // 40 chars

// The same vector is asserted by deploy/oncall-watchdog's gates.test.ts and
// matches `openssl dgst -sha256 -hmac` in deploy/oncall-send.sh — the three
// signers must agree byte for byte or the VPS can't page anyone.
func TestSignMatchesWorkerVector(t *testing.T) {
	got := Sign(secret, "1800000000", "abcdefabcdef0123", "POST", "/v1/alert", []byte(`{"x":1}`))
	want := "v1=6028d8faef5cfa9d35313a8bc95430f32c6b7e3ded899c195d927522592095f2"
	if got != want {
		t.Fatalf("signature drifted from the Worker's scheme:\n got %s\nwant %s", got, want)
	}
}

func TestNewIsNilWhenUnconfigured(t *testing.T) {
	for _, tc := range []struct{ url, secret string }{
		{"", secret}, {"ftp://x", secret}, {"https://w.example", ""}, {"https://w.example", "short"},
	} {
		if New(tc.url, tc.secret) != nil {
			t.Errorf("New(%q, len %d) should be nil", tc.url, len(tc.secret))
		}
	}
	var c *Client
	if err := c.Heartbeat(context.Background(), "status"); err != nil {
		t.Fatalf("nil client must be a no-op, got %v", err)
	}
}

func TestSendSignsEachAttempt(t *testing.T) {
	var calls atomic.Int32
	nonces := make(chan string, 2)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		ts, nonce := r.Header.Get("X-Oncall-Timestamp"), r.Header.Get("X-Oncall-Nonce")
		if r.Header.Get("X-Oncall-Signature") != Sign(secret, ts, nonce, r.Method, r.URL.Path, body) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var a Alert
		if err := json.Unmarshal(body, &a); err != nil || a.ID != "S01" || a.State != "firing" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		nonces <- nonce
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusBadGateway) // first attempt fails → retried
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := New(srv.URL, secret)
	err := c.Send(context.Background(), Alert{State: "firing", ID: "S01", Sev: 2, Title: "t", Source: "test"})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if a, b := <-nonces, <-nonces; a == b {
		t.Fatalf("retry must use a fresh nonce, got %q twice", a)
	}
}

func TestClientErrorIsNotRetried(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	if err := New(srv.URL, secret).Heartbeat(context.Background(), "status"); err == nil {
		t.Fatal("expected an error on 401")
	}
	if calls.Load() != 1 {
		t.Fatalf("4xx must not be retried, got %d calls", calls.Load())
	}
}
