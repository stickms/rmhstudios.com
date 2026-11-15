package status

import (
	"context"
	"errors"
	"testing"
	"time"
)

// pg-boss / doctrine reads → on-call alarms. Each rule's edge is pinned: a
// wrong one is a missed puzzle day or a 3am false page.

func cond(cs []workerCondition, id, instance string) *workerCondition {
	for i := range cs {
		if cs[i].alert.ID == id && cs[i].alert.Instance == instance {
			return &cs[i]
		}
	}
	return nil
}

func TestNewWorkerWatch(t *testing.T) {
	read := func(context.Context) (map[string]time.Time, error) { return nil, nil }
	if newWorkerWatch(nil, nil, read, nil, nil) != nil {
		t.Fatal("no on-call client should mean no watcher")
	}
}

func TestPuzzleRule(t *testing.T) {
	day := time.Date(2026, 10, 22, 0, 0, 0, 0, time.UTC)
	at := func(ready time.Time, h, m int) workerCondition {
		return evaluatePuzzles(ready, day.Add(time.Duration(h)*time.Hour+time.Duration(m)*time.Minute))
	}
	if c := at(day, 0, 10); c.active || c.alert.ID != "A19" || c.alert.Sev != 2 {
		t.Fatalf("before 00:15 the midnight run may still be going: %+v", c)
	}
	if c := at(day, 0, 20); !c.active {
		t.Fatal("after 00:15 with only today's puzzles, tomorrow's are missing")
	}
	if c := at(day.AddDate(0, 0, 1), 0, 20); c.active {
		t.Fatal("tomorrow's puzzles exist: no alarm")
	}
	if c := at(day.AddDate(0, 0, 1), 23, 59); c.active {
		t.Fatal("still fine late in the day")
	}
	if c := at(time.Time{}, 12, 0); !c.active {
		t.Fatal("no complete day at all is missing tomorrow's puzzles")
	}
}

// B07 is read from the Node bot's pg-boss heartbeat queue: it completes a job
// every minute while the gateway is READY and fails one otherwise.
func TestGatewayRule(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	hb := func(scheduled bool, ago time.Duration) GatewayHeartbeat {
		h := GatewayHeartbeat{Scheduled: scheduled}
		if ago >= 0 {
			h.LastCompleted = now.Add(-ago)
		}
		return h
	}
	if _, ok := evaluateGateway(hb(false, time.Hour), true, now); ok {
		t.Fatal("an unscheduled heartbeat (no token: the bot is disabled) is not an outage")
	}
	if _, ok := evaluateGateway(hb(true, -1), false, now); ok {
		t.Fatal("a bot that never connected (no completed heartbeat) is not an outage")
	}
	if c, ok := evaluateGateway(hb(true, time.Minute), false, now); !ok || c.active || c.alert.ID != "B07" || c.alert.Sev != 3 {
		t.Fatalf("a heartbeat a minute old is connected: %+v", c)
	}
	if c, _ := evaluateGateway(hb(true, GatewayHeartbeatLimit), false, now); c.active {
		t.Fatal("exactly the limit is still connected")
	}
	if c, ok := evaluateGateway(hb(true, GatewayHeartbeatLimit+time.Minute), false, now); !ok || !c.active {
		t.Fatalf("over 5m since the last READY heartbeat is B07: %+v", c)
	}
	if c, ok := evaluateGateway(hb(true, -1), true, now); !ok || !c.active {
		t.Fatalf("seen connected, then every row pruned: still down: %+v", c)
	}
}

type fakeWarner struct{ n int }

func (f *fakeWarner) Info(string, ...any) {}
func (f *fakeWarner) Warn(string, ...any) { f.n++ }

func TestGatewayConditionTracksSeen(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	var next GatewayHeartbeat
	var readErr error
	warn := &fakeWarner{}
	w := &workerWatch{tracks: map[string]*workerTrack{}, logger: warn}
	w.discordGateway = func(context.Context) (GatewayHeartbeat, error) { return next, readErr }

	next = GatewayHeartbeat{Scheduled: true}
	if len(w.gatewayCondition(context.Background(), now)) != 0 || w.gatewaySeen {
		t.Fatal("never connected: no condition")
	}
	next = GatewayHeartbeat{Scheduled: true, LastCompleted: now.Add(-time.Minute)}
	if cs := w.gatewayCondition(context.Background(), now); len(cs) != 1 || cs[0].active || !w.gatewaySeen {
		t.Fatalf("connected: %+v", cs)
	}
	next = GatewayHeartbeat{Scheduled: true}
	if cs := w.gatewayCondition(context.Background(), now); len(cs) != 1 || !cs[0].active {
		t.Fatalf("rows pruned after being seen connected: down: %+v", cs)
	}
	readErr = errors.New("db down")
	if len(w.gatewayCondition(context.Background(), now)) != 0 || warn.n != 1 {
		t.Fatal("a failed read holds state and is logged")
	}
	readErr = nil
	next = GatewayHeartbeat{Scheduled: false}
	if len(w.gatewayCondition(context.Background(), now)) != 0 || w.gatewaySeen {
		t.Fatal("unscheduled (disabled on purpose) resets seen and raises nothing")
	}
}

func TestWorkerStepDebounces(t *testing.T) {
	w := &workerWatch{tracks: map[string]*workerTrack{}}
	c := []workerCondition{{active: true, forChecks: 2, clearCk: 2}}
	c[0].alert.ID = "B07"
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

func TestNodeJobFreshness(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	at := func(ago time.Duration) map[string]time.Time {
		return map[string]time.Time{JobQueueStreak: now.Add(-ago)}
	}
	if c := cond(evaluateNodeJobs(at(2*time.Hour), now), "B06", "streak_sweep"); c == nil || c.active || c.alert.Sev != 3 {
		t.Fatalf("2h old is fresh (limit 3h): %+v", c)
	}
	if c := cond(evaluateNodeJobs(at(3*time.Hour+time.Minute), now), "B06", "streak_sweep"); c == nil || !c.active {
		t.Fatalf("over 3h is a Sev3 B06: %+v", c)
	}
	if len(evaluateNodeJobs(map[string]time.Time{}, now)) != 0 {
		t.Fatal("a job with no completed run (disabled/new) must not alarm")
	}
	if q := NodeJobQueues(); len(q) != 3 || q[0] != "streak.reminder-sweep" || q[1] != "lights-out.recap" || q[2] != "doctrine.sahur-activation" {
		t.Fatalf("queues: %v", q)
	}
	// recap (5m cadence) and Sahur activation (1m) keep the limits they had in the Go supervisor.
	for _, c := range []struct {
		job, queue   string
		fresh, stale time.Duration
	}{
		{"recap", JobQueueRecap, 19 * time.Minute, 21 * time.Minute},
		{"sahur_activation", JobQueueSahur, 9 * time.Minute, 11 * time.Minute},
	} {
		at := func(ago time.Duration) map[string]time.Time { return map[string]time.Time{c.queue: now.Add(-ago)} }
		if x := cond(evaluateNodeJobs(at(c.fresh), now), "B06", c.job); x == nil || x.active || x.alert.Sev != 3 {
			t.Fatalf("%s %s old is fresh: %+v", c.job, c.fresh, x)
		}
		if x := cond(evaluateNodeJobs(at(c.stale), now), "B06", c.job); x == nil || !x.active {
			t.Fatalf("%s %s old is a Sev3 B06: %+v", c.job, c.stale, x)
		}
	}
}
