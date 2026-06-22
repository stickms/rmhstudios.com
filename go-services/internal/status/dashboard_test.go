package status

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandlerServesAPIAndHealth(t *testing.T) {
	svc := New(Config{Targets: []Target{{Name: "web", URL: "https://rmhstudios.com"}}})
	h := svc.Handler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/status", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"services"`) {
		t.Fatalf("api/status wrong: %d %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/health", nil))
	if rec.Code != 200 {
		t.Fatalf("health wrong: %d", rec.Code)
	}
}

// TestHealthHasUptime asserts /health returns the Node shape
// {"status":"ok","uptime":<seconds>} — the uptime field must be present and a
// non-negative number.
func TestHealthHasUptime(t *testing.T) {
	svc := New(Config{Targets: []Target{{Name: "web", URL: "https://rmhstudios.com"}}})
	h := svc.Handler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/health", nil))
	if rec.Code != 200 {
		t.Fatalf("health wrong: %d", rec.Code)
	}

	var body struct {
		Status string   `json:"status"`
		Uptime *float64 `json:"uptime"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("health body not JSON: %v (%s)", err, rec.Body.String())
	}
	if body.Status != "ok" {
		t.Fatalf("expected status ok, got %q", body.Status)
	}
	if body.Uptime == nil {
		t.Fatalf("health missing uptime field: %s", rec.Body.String())
	}
	if *body.Uptime < 0 {
		t.Fatalf("uptime should be non-negative, got %v", *body.Uptime)
	}
}

// TestAPIStatusNullFields asserts the /api/status JSON emits explicit `null`
// for latencyMs and uptimePct (never-checked service), matching the Node source
// which serialises null rather than omitting the keys.
func TestAPIStatusNullFields(t *testing.T) {
	svc := New(Config{Targets: []Target{{Name: "web", URL: "https://rmhstudios.com"}}})
	h := svc.Handler()

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", "/api/status", nil))

	body := rec.Body.String()
	for _, want := range []string{`"latencyMs": null`, `"uptimePct": null`, `"status"`, `"checkedAt"`, `"services"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("expected %q in /api/status body, got:\n%s", want, body)
		}
	}
}
