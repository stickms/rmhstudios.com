package status

import (
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
