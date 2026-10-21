package status

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/oncall"
)

// Which incidents page on-call, and how.

func TestAlertForMapsAutoIncidents(t *testing.T) {
	inc := &Incident{ID: "i1", Title: "RMHbox outage", Kind: "auto", Impact: ImpactMajor,
		Components: []string{"RMHbox"}, Updates: []IncidentUpdate{{Body: "HTTP 502"}}}
	a, ok := alertFor(Notification{Event: "incident.created", Incident: inc}, "https://status.example")
	if !ok || a.ID != "STATUS" || a.Instance != "rmhbox" || a.Sev != 2 || a.State != "firing" {
		t.Fatalf("down incident should page as Sev2 STATUS:rmhbox, got %+v ok=%v", a, ok)
	}
	if a.Detail != "HTTP 502\nhttps://status.example/incidents/i1" {
		t.Fatalf("detail: %q", a.Detail)
	}

	inc.Impact = ImpactMinor
	if a, _ := alertFor(Notification{Event: "incident.updated", Incident: inc}, ""); a.Sev != 3 {
		t.Fatalf("degraded should be Sev3, got %d", a.Sev)
	}
	if a, _ := alertFor(Notification{Event: "incident.resolved", Incident: inc}, ""); a.State != "resolved" {
		t.Fatalf("resolved event should resolve, got %q", a.State)
	}
}

func TestAlertForSkipsWhatIsNotForOncall(t *testing.T) {
	cases := map[string]Notification{
		"manual incident": {Event: "incident.created", Incident: &Incident{Kind: "manual", Components: []string{"RMHbox"}}},
		"watchdog covers": {Event: "incident.created", Incident: &Incident{Kind: "auto", Components: []string{"Website"}}},
		"maintenance":     {Event: "maintenance.scheduled", Maintenance: &Maintenance{}},
		"announcement":    {Event: "announcement.created", Announcement: &Announcement{}},
	}
	for name, n := range cases {
		if _, ok := alertFor(n, ""); ok {
			t.Errorf("%s should not reach on-call", name)
		}
	}
}

func TestHeartbeaterRateLimitsCheckIns(t *testing.T) {
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/heartbeat/status" {
			hits.Add(1)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	h := &heartbeater{client: oncall.New(srv.URL, "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"), interval: time.Minute}
	t0 := time.Unix(1_800_000_000, 0)
	for i := 0; i < 4; i++ { // four 15s probe cycles inside one minute
		h.afterCycle(context.Background(), t0.Add(time.Duration(i)*15*time.Second))
		waitIdle(h)
	}
	h.afterCycle(context.Background(), t0.Add(61*time.Second))
	waitIdle(h)
	if got := hits.Load(); got != 2 {
		t.Fatalf("expected 2 check-ins (t=0 and t=61s), got %d", got)
	}

	var nilH *heartbeater
	nilH.afterCycle(context.Background(), t0) // on-call unset: must be a no-op
}

func waitIdle(h *heartbeater) {
	for i := 0; i < 200 && h.inFlight.Load(); i++ {
		time.Sleep(5 * time.Millisecond)
	}
}
