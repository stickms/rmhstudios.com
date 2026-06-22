package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeMarksUpAndDown(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) }))
	defer up.Close()
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }))
	defer down.Close()

	p := NewProber([]Target{{Name: "up", URL: up.URL}, {Name: "down", URL: down.URL}})
	p.ProbeOnce(context.Background())
	snap := p.Snapshot()

	if !snap.Service("up").Up || snap.Service("down").Up {
		t.Fatalf("probe results wrong: %+v", snap)
	}
}
