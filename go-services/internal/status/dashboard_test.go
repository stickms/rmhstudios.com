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
