package status

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// The prober runs every 15 s against ~8 targets. A connection can only be
// reused if the previous response body was read to EOF before Close; closing an
// unread body makes net/http discard the connection, so every cycle paid a
// fresh TCP (and, for the public origin, TLS) handshake per target.
func TestProbeReusesConnections(t *testing.T) {
	cases := map[string]struct {
		body   string
		expect string
	}{
		"small, no assertion":          {`{"status":"ok"}`, ""},
		"small, with assertion":        {`{"status":"ok"}`, `"status":"ok"`},
		"larger than the read cap":     {strings.Repeat("x", maxProbeBodyBytes+4096), "x"},
		"large, no assertion (unread)": {strings.Repeat("y", 200<<10), ""},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			var dials atomic.Int32
			d := &net.Dialer{}
			client := &http.Client{Timeout: 4 * time.Second, Transport: &http.Transport{
				DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
					dials.Add(1)
					return d.DialContext(ctx, network, addr)
				},
			}}
			target := Target{Name: "t", URL: srv.URL, Expect: tc.expect}
			const cycles = 6
			for i := 0; i < cycles; i++ {
				ss, _ := probe(context.Background(), client, target)
				if ss.Status != StatusUp {
					t.Fatalf("cycle %d: status %s (%s)", i, ss.Status, ss.Detail)
				}
			}
			if n := dials.Load(); n != 1 {
				t.Fatalf("%d connections for %d probe cycles, want 1", n, cycles)
			}
		})
	}
}
