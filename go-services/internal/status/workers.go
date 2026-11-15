package status

import (
	"context"
	"fmt"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/oncall"
)

// Worker health for on-call. Once a minute the status service reads the pg-boss
// job table and schedule (the background work all runs in the Node `jobs`
// worker) and the daily-puzzle table, and turns them into watchdog alarms:
//
//	A19 Sev2  tomorrow's daily puzzles don't exist after 00:15 UTC (read from doctrine_puzzle)
//	B06 Sev3  a job's last success is older than its limit (nodeJobLimits)
//	B07 Sev3  the Discord gateway has been disconnected for 5m (the bot's heartbeat queue)
//
// Alarms are debounced (fire after N bad checks, resolve after M good ones)
// and only transitions are sent, plus a re-send of anything firing every 10m.
// The jobs worker being down is A16 (lib/oncall), not here.
//
// There is no Go worker left to scrape: the supervisor, its /metrics and the
// A11 worker-down alarm went with the last Go worker, the Discord bot, which
// runs in the Node jobs worker now (server/discord-bot/, D3).

// WorkerCheckInterval is how often the worker alarms are evaluated.
const WorkerCheckInterval = time.Minute

const workerRefresh = 10 * time.Minute

// JobQueueStreak is the pg-boss queue of the Node streak-saver job
// (lib/streak-reminders.server.ts STREAK_REMINDER_QUEUE).
const JobQueueStreak = "streak.reminder-sweep"

// pg-boss queues of the Node recap and Doctrine Sahur jobs
// (lib/lights-out/recap.server.ts RECAP_QUEUE,
// features/doctrine/engine/jobs.server.ts DOCTRINE_SAHUR_QUEUE).
const (
	JobQueueRecap = "lights-out.recap"
	JobQueueSahur = "doctrine.sahur-activation"
)

// JobQueueDiscordHeartbeat is the Discord bot's gateway heartbeat
// (server/discord-bot/jobs.ts DISCORD_BOT_QUEUES.heartbeat): a per-minute cron
// whose job COMPLETES only while the gateway is READY and fails otherwise. The
// bot schedules it whenever a token is set and unschedules it when none is.
const JobQueueDiscordHeartbeat = "discord-bot.gateway-heartbeat"

// GatewayHeartbeatLimit is how old the last completed heartbeat may be before
// B07 fires: the supervisor's gauge had to read 0 for five one-minute checks.
const GatewayHeartbeatLimit = 5 * time.Minute

// nodeJobLimits: jobs that moved from the Go supervisor to the Node `jobs`
// worker (D3). Freshness is read from pg-boss's own job table
// (Config.JobLastSuccess): the latest COMPLETED job of the queue. The alarm is
// B06 Sev3, keyed by the job name, with the limit it had in the supervisor.
var nodeJobLimits = []struct {
	job, queue string
	limit      time.Duration
}{
	{"streak_sweep", JobQueueStreak, 3 * time.Hour},       // hourly
	{"recap", JobQueueRecap, 20 * time.Minute},            // every 5m
	{"sahur_activation", JobQueueSahur, 10 * time.Minute}, // every minute
}

// NodeJobQueues lists the queues JobLastSuccess should report on.
func NodeJobQueues() []string {
	out := make([]string, len(nodeJobLimits))
	for i, j := range nodeJobLimits {
		out[i] = j.queue
	}
	return out
}

// evaluateNodeJobs turns last-success times (by queue) into B06 conditions. A
// queue with no completed job at all is skipped: the job is disabled, brand
// new, or its history has been pruned.
func evaluateNodeJobs(last map[string]time.Time, now time.Time) []workerCondition {
	var out []workerCondition
	for _, j := range nodeJobLimits {
		t, ok := last[j.queue]
		if !ok || t.IsZero() {
			continue
		}
		age := now.Sub(t)
		out = append(out, workerCondition{
			alert:  oncall.Alert{ID: "B06", Instance: j.job, Sev: 3, Title: "Background job stale: " + j.job, Detail: fmt.Sprintf("%s (jobs worker, pg-boss queue %s) last succeeded %s ago; it should run at least every %s.", j.job, j.queue, age.Round(time.Minute), j.limit), Source: "status"},
			active: age > j.limit, forChecks: 1, clearCk: 1,
		})
	}
	return out
}

// GatewayHeartbeat is one read of the Discord bot's heartbeat queue.
type GatewayHeartbeat struct {
	// Scheduled: the heartbeat cron exists, i.e. the bot has a token and is
	// meant to be online. False = the bot is disabled; B07 is not evaluated.
	Scheduled bool
	// LastCompleted is the newest completed heartbeat (zero if none is kept).
	LastCompleted time.Time
}

// evaluateGateway turns a heartbeat read into B07. ok=false means "no
// condition this check": the bot is disabled, or it has never been seen
// connected (a bad token or a first boot), which, as with the supervisor's
// gauge before, is not an outage. seen records that a completed heartbeat was
// observed once, so a gap longer than pg-boss keeps rows for still counts.
func evaluateGateway(hb GatewayHeartbeat, seen bool, now time.Time) (workerCondition, bool) {
	if !hb.Scheduled || (hb.LastCompleted.IsZero() && !seen) {
		return workerCondition{}, false
	}
	down := hb.LastCompleted.IsZero() || now.Sub(hb.LastCompleted) > GatewayHeartbeatLimit
	detail := "The Discord bot's gateway session (jobs worker) has not been READY for 5m; /chat and Alex are offline."
	if !hb.LastCompleted.IsZero() {
		detail = fmt.Sprintf("The Discord bot's gateway session (jobs worker) was last READY %s ago (pg-boss queue %s); /chat and Alex are offline.", now.Sub(hb.LastCompleted).Round(time.Minute), JobQueueDiscordHeartbeat)
	}
	return workerCondition{
		alert:  oncall.Alert{ID: "B07", Sev: 3, Title: "Discord bot disconnected", Detail: detail, Source: "status"},
		active: down, forChecks: 1, clearCk: 2,
	}, true
}

// evaluatePuzzles turns "the latest UTC day whose daily puzzles all exist" into
// A19. readyFor is the zero time when no complete day exists at all. The Node job
// makes tomorrow's puzzles at 00:00 UTC; the alarm waits until 00:15.
func evaluatePuzzles(readyFor time.Time, now time.Time) workerCondition {
	utc := now.UTC()
	tomorrow := time.Date(utc.Year(), utc.Month(), utc.Day()+1, 0, 0, 0, 0, time.UTC)
	afterRun := utc.Hour() > 0 || utc.Minute() >= 15
	through := "no day"
	if !readyFor.IsZero() {
		through = readyFor.UTC().Format("2006-01-02")
	}
	return workerCondition{
		alert:  oncall.Alert{ID: "A19", Sev: 2, Title: "Tomorrow's daily puzzles missing", Detail: fmt.Sprintf("Daily puzzles exist through %s, but not for %s. If today's midnight run doesn't make them, players get no puzzle tomorrow. The jobs worker (queue doctrine.daily-puzzles) makes tomorrow's at 00:00 UTC and at startup: check its logs, then restart the jobs container to rerun it.", through, tomorrow.Format("2006-01-02")), Source: "status"},
		active: afterRun && readyFor.Before(tomorrow), forChecks: 2, clearCk: 1,
	}
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

// workerWatch holds the debounce state between checks.
type workerWatch struct {
	// jobLastSuccess reads the last completed run per pg-boss queue; nil = B06 off.
	jobLastSuccess func(ctx context.Context) (map[string]time.Time, error)
	// puzzlesReadyFor reads the latest day whose daily puzzles all exist; nil = A19 off.
	puzzlesReadyFor func(ctx context.Context) (time.Time, error)
	// discordGateway reads the bot's heartbeat queue; nil = B07 off.
	discordGateway func(ctx context.Context) (GatewayHeartbeat, error)
	client         *oncall.Client
	logger         Warner

	tracks      map[string]*workerTrack
	gatewaySeen bool // a completed heartbeat has been read at least once
}

func newWorkerWatch(client *oncall.Client, logger Warner, jobLastSuccess func(ctx context.Context) (map[string]time.Time, error), puzzlesReadyFor func(ctx context.Context) (time.Time, error), discordGateway func(ctx context.Context) (GatewayHeartbeat, error)) *workerWatch {
	if client == nil || (jobLastSuccess == nil && puzzlesReadyFor == nil && discordGateway == nil) {
		return nil
	}
	return &workerWatch{
		client: client, logger: logger, jobLastSuccess: jobLastSuccess, puzzlesReadyFor: puzzlesReadyFor, discordGateway: discordGateway,
		tracks: map[string]*workerTrack{},
	}
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

// gatewayCondition reads the heartbeat and evaluates B07. A failed read holds
// state (no condition), like every other read here.
func (w *workerWatch) gatewayCondition(ctx context.Context, now time.Time) []workerCondition {
	if w.discordGateway == nil {
		return nil
	}
	hb, err := w.discordGateway(ctx)
	if err != nil {
		if w.logger != nil {
			w.logger.Warn("status: discord heartbeat read failed", "error", err)
		}
		return nil
	}
	if !hb.Scheduled {
		w.gatewaySeen = false // disabled on purpose: a later re-enable starts from "never connected"
	}
	c, ok := evaluateGateway(hb, w.gatewaySeen, now)
	if hb.Scheduled && !hb.LastCompleted.IsZero() {
		w.gatewaySeen = true
	}
	if !ok {
		return nil
	}
	return []workerCondition{c}
}

func (w *workerWatch) check(ctx context.Context, now time.Time) {
	var conds []workerCondition
	if w.jobLastSuccess != nil {
		// A failed read holds state (no condition).
		if last, err := w.jobLastSuccess(ctx); err != nil {
			if w.logger != nil {
				w.logger.Warn("status: job freshness read failed", "error", err)
			}
		} else {
			conds = append(conds, evaluateNodeJobs(last, now)...)
		}
	}
	if w.puzzlesReadyFor != nil {
		if readyFor, err := w.puzzlesReadyFor(ctx); err != nil {
			if w.logger != nil {
				w.logger.Warn("status: daily puzzle read failed", "error", err)
			}
		} else {
			conds = append(conds, evaluatePuzzles(readyFor, now))
		}
	}
	conds = append(conds, w.gatewayCondition(ctx, now)...)
	for _, a := range w.step(conds, now) {
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
