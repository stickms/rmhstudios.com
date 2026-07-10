package telemetry

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMergedHandlerExposesEveryServiceLabel(t *testing.T) {
	a := New("worker-a")
	b := New("worker-b")
	a.JobRuns.WithLabelValues("job-a", "ok").Inc()
	b.JobRuns.WithLabelValues("job-b", "ok").Inc()

	rec := httptest.NewRecorder()
	MergedHandler(a, b).ServeHTTP(rec, httptest.NewRequest("GET", "/metrics", nil))
	body := rec.Body.String()

	if !strings.Contains(body, `service="worker-a"`) || !strings.Contains(body, `service="worker-b"`) {
		t.Fatalf("merged output missing a service label:\n%s", body)
	}
}
