package status

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/oncall"
)

// Go worker health for on-call. Once a minute the status service reads the
// supervisor's /metrics (compose network) and turns it into watchdog alarms:
//
//	A11 Sev2  a worker is down (rmh_worker_up 0 for 2m) or panicking (>=3 in 15m)
//	A19 Sev2  tomorrow's daily puzzles don't exist after 00:15 UTC
//	B06 Sev3  a job's last success is older than its limit (staleLimits)
//	B07 Sev3  the Discord gateway has been disconnected for 5m
//
// Alarms are debounced (fire after N bad checks, resolve after M good ones)
// and only transitions are sent, plus a re-send of anything firing every 10m.
// The supervisor being unreachable is not handled here: the status page's own
// supervisor probe already opens an incident for that (STATUS:background-workers).

// WorkerCheckInterval is how often supervisor metrics are evaluated.
const WorkerCheckInterval = time.Minute

const workerRefresh = 10 * time.Minute

// staleLimits: jobs that run on a fixed cadence and record every run. Jobs not
// listed (event-driven, weekly, or idle without config) are never "stale".
var staleLimits = map[string]time.Duration{
	"recap":            20 * time.Minute, // every 5m
	"sahur_activation": 10 * time.Minute, // every 60s
	"streak_sweep":     3 * time.Hour,    // hourly
}

type promSample struct {
	name   string
	labels map[string]string
	value  float64
}

// parsePromText reads the Prometheus text format's sample lines (enough of it
// for our own exporters: no escaped quotes or commas in label values).
func parsePromText(r io.Reader) []promSample {
	var out []promSample
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || line[0] == '#' {
			continue
		}
		name, rest := line, ""
		labels := map[string]string{}
		if i := strings.IndexByte(line, '{'); i >= 0 {
			j := strings.IndexByte(line, '}')
			if j < i {
				continue
			}
			name = line[:i]
			for _, kv := range strings.Split(line[i+1:j], ",") {
				if k, v, ok := strings.Cut(kv, "="); ok {
					labels[strings.TrimSpace(k)] = strings.Trim(strings.TrimSpace(v), `"`)
				}
			}
			rest = strings.TrimSpace(line[j+1:])
		} else if k, v, ok := strings.Cut(line, " "); ok {
			name, rest = k, strings.TrimSpace(v)
		}
		fields := strings.Fields(rest)
		if len(fields) == 0 {
			continue
		}
		v, err := strconv.ParseFloat(fields[0], 64)
		if err != nil {
			continue
		}
		out = append(out, promSample{name: name, labels: labels, value: v})
	}
	return out
}

type workerCondition struct {
	alert              oncall.Alert // State is filled in on transition
	active             bool
	forChecks, clearCk int
}

type workerTrack struct {
	on, off  int
	firing   bool
	lastSent time.Time
}

// workerWatch holds the debounce state and counter memory between checks.
type workerWatch struct {
	url    string
	client *oncall.Client
	logger Warner
	http   *http.Client

	tracks       map[string]*workerTrack
	lastPanics   map[string]float64
	panicWindow  map[string][]float64
	gatewayEarUp bool // the gateway has been seen connected at least once
}

func newWorkerWatch(metricsURL string, client *oncall.Client, logger Warner) *workerWatch {
	if client == nil || metricsURL == "" {
		return nil
	}
	return &workerWatch{
		url: metricsURL, client: client, logger: logger,
		http:        &http.Client{Timeout: 5 * time.Second},
		tracks:      map[string]*workerTrack{},
		lastPanics:  map[string]float64{},
		panicWindow: map[string][]float64{},
	}
}

// evaluate turns one scrape into conditions. Pure apart from the watch's
// counter memory, so tests drive it with canned samples.
func (w *workerWatch) evaluate(samples []promSample, now time.Time) []workerCondition {
	var out []workerCondition
	alert := func(id, instance string, sev int, title, detail string) oncall.Alert {
		return oncall.Alert{ID: id, Instance: instance, Sev: sev, Title: title, Detail: detail, Source: "status"}
	}
	for _, s := range samples {
		svc := s.labels["service"]
		switch s.name {
		case "rmh_worker_up":
			out = append(out, workerCondition{
				alert:  alert("A11", svc, 2, "Background worker down: "+svc, fmt.Sprintf("%s is not running inside the supervisor (rmh_worker_up=0). docker logs <supervisor> --tail 200 | grep '\"worker\":\"%s\"'", svc, svc)),
				active: s.value == 0, forChecks: 2, clearCk: 2,
			})
		case "rmh_worker_panics_total":
			prev, seen := w.lastPanics[svc]
			w.lastPanics[svc] = s.value
			delta := 0.0
			if seen {
				delta = s.value - prev
				if delta < 0 { // supervisor restarted: counter reset
					delta = s.value
				}
			}
			win := append(w.panicWindow[svc], delta)
			if len(win) > 15 {
				win = win[len(win)-15:]
			}
			w.panicWindow[svc] = win
			total := 0.0
			for _, d := range win {
				total += d
			}
			out = append(out, workerCondition{
				alert:  alert("A11", svc+"-panics", 2, "Background worker crash-looping: "+svc, fmt.Sprintf("%s panicked %.0f times in the last 15m (recovered and restarted each time). Look for \"worker panic\" in the supervisor logs.", svc, total)),
				active: total >= 3, forChecks: 1, clearCk: 15,
			})
		case "rmh_job_last_success_timestamp_seconds":
			job := s.labels["job"]
			limit, ok := staleLimits[job]
			if !ok || s.value <= 0 {
				continue
			}
			age := now.Sub(time.Unix(int64(s.value), 0))
			out = append(out, workerCondition{
				alert:  alert("B06", job, 3, "Background job stale: "+job, fmt.Sprintf("%s (%s) last succeeded %s ago; it should run at least every %s.", job, svc, age.Round(time.Minute), limit)),
				active: age > limit, forChecks: 1, clearCk: 1,
			})
		case "rmh_doctrine_puzzles_ready_for_timestamp_seconds":
			if s.value <= 0 {
				continue // not reported yet since the supervisor started
			}
			utc := now.UTC()
			tomorrow := time.Date(utc.Year(), utc.Month(), utc.Day()+1, 0, 0, 0, 0, time.UTC)
			afterRun := utc.Hour() > 0 || utc.Minute() >= 15
			readyFor := time.Unix(int64(s.value), 0).UTC()
			out = append(out, workerCondition{
				alert:  alert("A19", "", 2, "Tomorrow's daily puzzles missing", fmt.Sprintf("Daily puzzles exist through %s, but not for %s. If today's midnight run doesn't make them, players get no puzzle tomorrow. Restart the supervisor to rerun it (it generates tomorrow's at startup).", readyFor.Format("2006-01-02"), tomorrow.Format("2006-01-02"))),
				active: afterRun && readyFor.Before(tomorrow), forChecks: 2, clearCk: 1,
			})
		case "rmh_discord_gateway_connected":
			if svc != "discord-bot" {
				continue
			}
			if s.value == 1 {
				w.gatewayEarUp = true
			}
			if !w.gatewayEarUp {
				continue // never connected (no token configured): not an outage
			}
			out = append(out, workerCondition{
				alert:  alert("B07", "", 3, "Discord bot disconnected", "The discord-bot gateway session has been down for 5m; /chat and Alex are offline."),
				active: s.value == 0, forChecks: 5, clearCk: 2,
			})
		}
	}
	return out
}

// step debounces conditions into the alerts to send now.
func (w *workerWatch) step(conds []workerCondition, now time.Time) []oncall.Alert {
	var send []oncall.Alert
	for _, c := range conds {
		key := c.alert.ID + ":" + c.alert.Instance
		t := w.tracks[key]
		if t == nil {
			t = &workerTrack{}
			w.tracks[key] = t
		}
		if c.active {
			t.on, t.off = t.on+1, 0
		} else {
			t.off, t.on = t.off+1, 0
		}
		a := c.alert
		switch {
		case !t.firing && t.on >= c.forChecks:
			t.firing, t.lastSent, a.State = true, now, "firing"
		case t.firing && t.off >= c.clearCk:
			t.firing, t.lastSent, a.State = false, now, "resolved"
		case t.firing && now.Sub(t.lastSent) >= workerRefresh:
			t.lastSent, a.State = now, "firing"
		default:
			continue
		}
		send = append(send, a)
	}
	return send
}

func (w *workerWatch) check(ctx context.Context, now time.Time) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.url, nil)
	if err != nil {
		return
	}
	resp, err := w.http.Do(req)
	if err != nil {
		return // the supervisor /health probe reports this
	}
	samples := parsePromText(resp.Body)
	resp.Body.Close()
	for _, a := range w.step(w.evaluate(samples, now), now) {
		if err := w.client.Send(ctx, a); err != nil && w.logger != nil {
			w.logger.Warn("status: worker alarm failed", "alarm", a.ID+":"+a.Instance, "error", err)
			// Undo so the next check retries the transition.
			if t := w.tracks[a.ID+":"+a.Instance]; t != nil {
				t.firing = a.State != "firing"
				t.lastSent = time.Time{}
			}
		}
	}
}

func (w *workerWatch) run(ctx context.Context) {
	if w == nil {
		return
	}
	ticker := time.NewTicker(WorkerCheckInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.check(ctx, time.Now())
		}
	}
}
