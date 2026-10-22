package status

import (
	"strconv"
	"strings"
	"testing"
	"time"
)

// Supervisor metrics → on-call alarms. Each rule's edge is pinned: a wrong one
// is a missed puzzle day or a 3am false page.

const scrape = `# HELP rmh_worker_up 1 while the worker's Run is executing.
# TYPE rmh_worker_up gauge
rmh_worker_up{service="recap"} 1
rmh_worker_up{service="streak-saver"} 0
rmh_worker_panics_total{service="recap"} 2
rmh_job_last_success_timestamp_seconds{job="recap",service="recap"} 1.8e+09
rmh_job_last_success_timestamp_seconds{job="bot-post",service="bot-worker"} 1
rmh_doctrine_puzzles_ready_for_timestamp_seconds{service="doctrine-worker"} 0
rmh_discord_gateway_connected{service="recap"} 0
`

func cond(cs []workerCondition, id, instance string) *workerCondition {
	for i := range cs {
		if cs[i].alert.ID == id && cs[i].alert.Instance == instance {
			return &cs[i]
		}
	}
	return nil
}

func TestParsePromText(t *testing.T) {
	s := parsePromText(strings.NewReader(scrape))
	if len(s) != 7 || s[0].name != "rmh_worker_up" || s[0].labels["service"] != "recap" || s[3].value != 1.8e9 {
		t.Fatalf("parse: %+v", s)
	}
}

func TestWorkerRules(t *testing.T) {
	w := newWorkerWatch("http://x", nil, nil)
	if w != nil {
		t.Fatal("no on-call client should mean no watcher")
	}
	w = &workerWatch{tracks: map[string]*workerTrack{}, lastPanics: map[string]float64{}, panicWindow: map[string][]float64{}}
	now := time.Unix(1_800_000_000, 0).Add(30 * time.Minute) // recap last ok 30m ago

	cs := w.evaluate(parsePromText(strings.NewReader(scrape)), now)
	if c := cond(cs, "A11", "streak-saver"); c == nil || !c.active || c.alert.Sev != 2 {
		t.Fatalf("worker down should be an active Sev2: %+v", c)
	}
	if c := cond(cs, "A11", "recap"); c == nil || c.active {
		t.Fatalf("running worker must not be down: %+v", c)
	}
	if c := cond(cs, "B06", "recap"); c == nil || !c.active {
		t.Fatalf("recap 30m stale (limit 20m) should be active: %+v", c)
	}
	if cond(cs, "B06", "bot-post") != nil {
		t.Fatal("jobs without a cadence limit are never stale")
	}
	if cond(cs, "A19", "") != nil || cond(cs, "B07", "") != nil {
		t.Fatal("unreported puzzles / a non-discord gateway gauge must not alarm")
	}
	if c := cond(cs, "A11", "recap-panics"); c == nil || c.active {
		t.Fatal("first sighting of the panic counter is a baseline")
	}
	cs = w.evaluate(parsePromText(strings.NewReader(strings.Replace(scrape, `{service="recap"} 2`, `{service="recap"} 5`, 1))), now)
	if c := cond(cs, "A11", "recap-panics"); c == nil || !c.active {
		t.Fatalf("3 new panics in 15m should page: %+v", c)
	}
}

func TestPuzzleAndGatewayRules(t *testing.T) {
	w := &workerWatch{tracks: map[string]*workerTrack{}, lastPanics: map[string]float64{}, panicWindow: map[string][]float64{}}
	day := time.Date(2026, 10, 22, 0, 0, 0, 0, time.UTC)
	readyToday := `rmh_doctrine_puzzles_ready_for_timestamp_seconds{service="doctrine-worker"} ` + strconv.FormatInt(day.Unix(), 10)
	at := func(h, m int) []workerCondition {
		return w.evaluate(parsePromText(strings.NewReader(readyToday)), day.Add(time.Duration(h)*time.Hour+time.Duration(m)*time.Minute))
	}
	if c := cond(at(0, 10), "A19", ""); c == nil || c.active {
		t.Fatal("before 00:15 the midnight run may still be going")
	}
	if c := cond(at(0, 20), "A19", ""); c == nil || !c.active {
		t.Fatal("after 00:15 with only today's puzzles, tomorrow's are missing")
	}

	gw := func(v string) []workerCondition {
		return w.evaluate(parsePromText(strings.NewReader(`rmh_discord_gateway_connected{service="discord-bot"} `+v)), day)
	}
	if cond(gw("0"), "B07", "") != nil {
		t.Fatal("a bot that never connected (no token) is not an outage")
	}
	gw("1")
	if c := cond(gw("0"), "B07", ""); c == nil || !c.active {
		t.Fatal("connected then dropped should be active")
	}
}

func TestWorkerStepDebounces(t *testing.T) {
	w := &workerWatch{tracks: map[string]*workerTrack{}}
	c := []workerCondition{{active: true, forChecks: 2, clearCk: 2}}
	c[0].alert.ID = "A11"
	t0 := time.Unix(0, 0)
	if len(w.step(c, t0)) != 0 {
		t.Fatal("one bad check is not enough")
	}
	if got := w.step(c, t0.Add(time.Minute)); len(got) != 1 || got[0].State != "firing" {
		t.Fatalf("second bad check fires: %+v", got)
	}
	if len(w.step(c, t0.Add(2*time.Minute))) != 0 {
		t.Fatal("no re-send inside the refresh window")
	}
	c[0].active = false
	w.step(c, t0.Add(3*time.Minute))
	if got := w.step(c, t0.Add(4*time.Minute)); len(got) != 1 || got[0].State != "resolved" {
		t.Fatalf("two good checks resolve: %+v", got)
	}
}
