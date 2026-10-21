package status

import (
	"context"
	"math"
	"math/rand"
	"net/http"
	"os"
	"testing"
	"time"
)

// richService builds a Service whose prober carries a realistic history — 90
// days of daily rollups, 90 hours of hourly buckets with latency, a full ring
// of raw checks — plus incidents, a maintenance window and an announcement, so
// every section of the page has something to say. Probes are custom functions:
// nothing touches the network.
func richService(t testing.TB) *Service {
	t.Helper()
	lat := int64(42)
	up := func(ctx context.Context) ProbeResult {
		return ProbeResult{Status: StatusUp, LatencyMs: &lat, Detail: "HTTP 200"}
	}
	targets := []Target{
		{Name: "Website", Description: "Main rmhstudios.com web app (server-rendered)", Group: "Core", DegradedAfter: 4 * time.Second, Probe: up},
		{Name: "App readiness", Description: "Web tier's dependencies", Group: "Core", DegradedAfter: 2500 * time.Millisecond, Probe: up},
		{Name: "Database", Description: "PostgreSQL (direct connection, SELECT 1)", Group: "Core", Probe: up},
		{Name: "Realtime / Games", Description: "Socket server", Group: "Realtime", DegradedAfter: 1500 * time.Millisecond, Probe: up},
		{Name: "RMHbox", Description: "Party-game WebSocket server", Group: "Realtime", DegradedAfter: 1500 * time.Millisecond, Probe: up},
		{Name: "Content feed", Description: "Public blog RSS", Group: "Content", DegradedAfter: 2500 * time.Millisecond, Probe: up},
		{Name: "Sitemap", Description: "Generated sitemap.xml", Group: "Content", DegradedAfter: 2500 * time.Millisecond, Probe: up},
		{Name: "Background workers", Description: "Supervisor", Group: "Platform", Probe: up},
	}
	svc := New(Config{Targets: targets})
	p := svc.prober
	rng := rand.New(rand.NewSource(7))
	now := time.Now().UTC()
	nowMs := now.UnixMilli()

	base := map[string]int64{"Website": 180, "App readiness": 60, "Database": 3, "Realtime / Games": 4, "RMHbox": 5, "Content feed": 240, "Sitemap": 300, "Background workers": 2}
	// failRate is the per-check failure probability; Website reproduces the
	// screenshot that started this work: frequent single-check blips.
	failRate := map[string]float64{"Website": 0.006, "App readiness": 0.03, "RMHbox": 0.002}

	for i, tg := range targets {
		h := p.hist[tg.Name]
		b0 := base[tg.Name]
		sample := func(at int64) Sample {
			l := b0 + int64(rng.NormFloat64()*float64(b0)*0.25)
			if l < 1 {
				l = 1
			}
			s := Sample{T: at, S: StatusUp, L: &l, C: 200}
			if rng.Float64() < failRate[tg.Name] {
				if rng.Float64() < 0.5 {
					s = Sample{T: at, S: StatusDown, C: 0, E: CatTimeout, D: "timeout after 4000ms"}
				} else {
					s = Sample{T: at, S: StatusDegraded, C: 503, E: CatHTTP5xx, D: "HTTP 503"}
				}
			}
			return s
		}
		record := func(b *Bucket, s Sample) {
			switch s.S {
			case StatusUp:
				b.Up++
			case StatusDegraded:
				b.Degraded++
			default:
				b.Down++
			}
			if s.L != nil {
				b.addLatency(*s.L)
			}
		}
		// Daily rollups: 90 days, one simulated check per 6 minutes.
		for d := 89; d >= 0; d-- {
			day := floorTo(nowMs, dayMs) - int64(d)*dayMs
			b := Bucket{T: day}
			for k := 0; k < 240; k++ {
				record(&b, sample(day+int64(k)*6*60*1000))
			}
			if tg.Name == "RMHbox" && d == 12 {
				b.Down += 40
			}
			h.daily = append(h.daily, b)
		}
		// Hourly buckets: 90 hours at the real 15s cadence.
		for hr := 89; hr >= 0; hr-- {
			start := floorTo(nowMs, time.Hour.Milliseconds()) - int64(hr)*time.Hour.Milliseconds()
			b := Bucket{T: start}
			for k := 0; k < 240; k++ {
				record(&b, sample(start+int64(k)*15000))
			}
			if tg.Name == "App readiness" && hr >= 30 && hr <= 33 {
				b.Down += 60
			}
			h.buckets = append(h.buckets, b)
		}
		// The raw ring: the last hour.
		for k := 239; k >= 0; k-- {
			s := sample(nowMs - int64(k)*15000)
			h.recent = append(h.recent, s)
			h.ctr.Checks++
			if s.C > 0 {
				h.ctr.Codes[codeClass(s.C)]++
			} else {
				h.ctr.Codes["none"]++
			}
			if s.E != "" {
				h.ctr.Errors[s.E]++
			}
		}
		last := h.recent[len(h.recent)-1]
		h.last = ServiceStatus{Name: tg.Name, Description: tg.Description, Group: tg.Group, Status: StatusUp, LatencyMs: last.L, Detail: "HTTP 200", CheckedAt: now.Format(isoMillis), Up: true}
		if last.L == nil {
			h.last.LatencyMs = &lat
		}
		h.ctr.FirstSeenAt = nowMs - 89*dayMs
		h.ctr.ConsecUp = 120 + i
		h.ctr.UpStreakStart = nowMs - int64(h.ctr.ConsecUp)*15000
		h.ctr.LastUpAt = nowMs
		h.ctr.LastFailAt = nowMs - 47*60*1000
		h.ctr.LastFailText = "timeout after 4000ms"
		h.ctr.Blips = 3 + i
		total := float64(*h.last.LatencyMs)
		h.detail = ProbeDetail{Kind: "http", Code: 200, Proto: "HTTP/2.0", Bytes: 48213, ContentType: "text/html; charset=utf-8",
			Phases: &Phases{DNS: 4.2, Connect: 11.8, TLS: 23.5, TTFB: math.Max(45, total*0.8), Total: math.Max(50, total)},
			TLS:    &TLSInfo{NotAfter: nowMs + 62*dayMs, Issuer: "WE1", Subject: "rmhstudios.com", Version: "TLS 1.3"}}
	}

	// RMHbox is down right now, and has been for a few checks.
	h := p.hist["RMHbox"]
	h.last.Status, h.last.Up, h.last.LatencyMs, h.last.Detail = StatusDown, false, nil, "connect: connection refused"
	h.ctr.ConsecUp, h.ctr.ConsecFail, h.ctr.FailStreakStart = 0, 6, nowMs-90*1000

	st := svc.store
	st.HandleEvents([]Event{{Kind: EventFailing, Service: "RMHbox", Group: "Realtime", Status: StatusDown, Detail: "connect: connection refused", Category: CatRefused, At: nowMs - 90*1000, Now: nowMs - 60*1000, Checks: 2}})
	for k, ago := range []time.Duration{50 * time.Hour, 7 * 24 * time.Hour, 20 * 24 * time.Hour} {
		start := nowMs - ago.Milliseconds()
		name := []string{"App readiness", "Website", "Content feed"}[k]
		st.HandleEvents([]Event{
			{Kind: EventFailing, Service: name, Group: "Core", Status: StatusDegraded, Detail: "HTTP 503", Category: CatHTTP5xx, At: start, Now: start + 30000, Checks: 2},
			{Kind: EventRecovered, Service: name, Group: "Core", Status: StatusUp, At: start + int64(k+1)*11*60*1000, Now: start + int64(k+1)*11*60*1000 + 30000},
		})
	}
	title, body, impact, state := "Elevated error rates on sign-in", "Some visitors could not sign in with Discord. A fix is rolling out.", ImpactMinor, StateMonitoring
	comps := []string{"Website"}
	inc, _ := st.CreateIncident(IncidentInput{Title: &title, Body: &body, Impact: &impact, State: &state, Components: &comps}, now.Add(-3*time.Hour))
	resolved, pm := StateResolved, "Root cause: an expired OAuth client secret.\n\nWe rotated it and added an expiry alarm."
	done := "Sign-in has been stable for an hour."
	_, _ = st.AddIncidentUpdate(inc.ID, IncidentInput{State: &resolved, Body: &done}, now.Add(-90*time.Minute))
	_, _ = st.PatchIncident(inc.ID, IncidentInput{Postmortem: &pm}, now)

	mt, md := "Database upgrade to PostgreSQL 18", "Expect up to five minutes of read-only mode."
	starts, ends := nowMs+26*time.Hour.Milliseconds(), nowMs+27*time.Hour.Milliseconds()
	mc := []string{"Database", "App readiness"}
	_, _ = st.CreateMaintenance(MaintenanceInput{Title: &mt, Description: &md, StartsAt: &starts, EndsAt: &ends, Components: &mc}, now)
	_, _ = st.CreateAnnouncement(AnnouncementInput{Message: "New: incident history, uptime reports and a Statuspage-compatible API.", Level: "info", Link: "/history"}, now)
	return svc
}

// TestServeFixture serves the rich fixture on STATUS_SERVE_ADDR for manual and
// browser checks. Skipped unless that env var is set; blocks until killed.
func TestServeFixture(t *testing.T) {
	addr := os.Getenv("STATUS_SERVE_ADDR")
	if addr == "" {
		t.Skip("set STATUS_SERVE_ADDR=127.0.0.1:7999 to serve the fixture dashboard")
	}
	svc := richService(t)
	t.Fatal(http.ListenAndServe(addr, svc.Handler()))
}
