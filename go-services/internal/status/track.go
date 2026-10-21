package status

import (
	"strconv"
	"sync"
	"time"
)

// Per-service tracking beyond the Node-compatible hourly buckets: a daily
// rollup that outlives the hourly window, a ring of raw recent checks, running
// counters (status-code classes, failure categories, streaks, state changes)
// and the debounce that turns a failure streak into an incident.

// Sample is one raw probe result in the recent ring. Field names are short on
// purpose: the ring is persisted and served, and it is the largest thing in
// either.
type Sample struct {
	T int64  `json:"t"`
	S Status `json:"s"`
	L *int64 `json:"l,omitempty"`
	C int    `json:"c,omitempty"`
	E string `json:"e,omitempty"`
	D string `json:"d,omitempty"`
	// M marks a check taken inside a maintenance window.
	M bool `json:"m,omitempty"`
}

// Counters are a service's running tallies. Persisted, so they describe the
// service's whole recorded life rather than the life of this process.
type Counters struct {
	Checks int            `json:"checks"`
	Codes  map[string]int `json:"codes"`
	Errors map[string]int `json:"errors"`
	// Blips are failure streaks too short to open an incident.
	Blips int `json:"blips"`

	ConsecUp   int `json:"consecUp"`
	ConsecFail int `json:"consecFail"`
	// FailStreakStart / UpStreakStart are when the current streak began, used
	// as an incident's start and resolution times.
	FailStreakStart int64 `json:"failStreakStart,omitempty"`
	UpStreakStart   int64 `json:"upStreakStart,omitempty"`

	LastUpAt     int64  `json:"lastUpAt,omitempty"`
	LastFailAt   int64  `json:"lastFailAt,omitempty"`
	LastFailText string `json:"lastFailText,omitempty"`
	LastChangeAt int64  `json:"lastChangeAt,omitempty"`
	LastStatus   Status `json:"lastStatus,omitempty"`
	// Changes are the times of the most recent state changes, newest last —
	// the input to flap detection.
	Changes []int64 `json:"changes,omitempty"`
	// FirstSeenAt is the first check this service ever recorded.
	FirstSeenAt int64 `json:"firstSeenAt,omitempty"`
}

func newCounters() *Counters {
	return &Counters{Codes: map[string]int{}, Errors: map[string]int{}}
}

// maxChanges bounds the state-change log kept for flap detection.
const maxChanges = 64

// history holds per-service rolling buckets and the last probe result.
type history struct {
	mu      sync.Mutex
	last    ServiceStatus
	buckets []Bucket
	daily   []Bucket
	recent  []Sample
	detail  ProbeDetail
	ctr     *Counters
}

// EventKind names an incident lifecycle event.
type EventKind string

const (
	// EventFailing fires once, when a failure streak reaches openAfter checks.
	EventFailing EventKind = "failing"
	// EventStillFailing fires on every further failed check of that streak.
	EventStillFailing EventKind = "still_failing"
	// EventRecovered fires once, when a good streak reaches closeAfter checks.
	EventRecovered EventKind = "recovered"
)

// Event is one incident lifecycle signal from the prober to the incident store.
type Event struct {
	Kind     EventKind
	Service  string
	Group    string
	Status   Status
	Detail   string
	Category string
	// At is when the event's streak began: the first failed check for
	// EventFailing, the first good check for EventRecovered.
	At int64
	// Now is the check that produced the event.
	Now int64
	// Checks is the length of the failure streak so far.
	Checks int
}

// codeClass buckets an HTTP status code ("2xx"…"5xx"), or "none" when the
// request never got an answer.
func codeClass(code int) string {
	if code < 100 {
		return "none"
	}
	return strconv.Itoa(code/100) + "xx"
}

// record folds one probe result into the history. The caller holds h.mu and
// p.mu. It returns the incident event this check produced, if any.
func (h *history) record(p *Prober, ss ServiceStatus, pd ProbeDetail, now time.Time, maint bool) *Event {
	h.last = ss
	h.detail = pd
	if h.ctr == nil {
		h.ctr = newCounters()
	}

	// Node's recordSample skips 'unknown' so a "not configured" service does
	// not tank the uptime percentage. Only up/degraded/down are bucketed.
	if ss.Status == StatusUnknown {
		return nil
	}

	nowMs := now.UnixMilli()
	c := h.ctr
	c.Checks++
	if c.FirstSeenAt == 0 {
		c.FirstSeenAt = nowMs
	}
	if pd.Kind == "http" {
		c.Codes[codeClass(pd.Code)]++
	}
	if pd.Category != "" {
		c.Errors[pd.Category]++
	}

	// A failure inside a maintenance window is recorded as maintenance: kept in
	// the ring and the bucket's Maint column, excluded from uptime and from
	// incident detection — the window is the announcement.
	inMaint := maint && ss.Status != StatusUp

	h.buckets = upsertBucket(h.buckets, floorTo(nowMs, p.bucketDur.Milliseconds()), p.maxBuckets, ss, inMaint)
	h.daily = upsertBucket(h.daily, floorTo(nowMs, dayMs), p.maxDays, ss, inMaint)

	sample := Sample{T: nowMs, S: ss.Status, L: ss.LatencyMs, C: pd.Code, E: pd.Category, M: inMaint}
	if ss.Status != StatusUp {
		sample.D = truncate(ss.Detail, 160)
	}
	h.recent = append(h.recent, sample)
	if p.recentCap > 0 && len(h.recent) > p.recentCap {
		h.recent = h.recent[len(h.recent)-p.recentCap:]
	}

	if c.LastStatus != "" && c.LastStatus != ss.Status {
		c.LastChangeAt = nowMs
		c.Changes = append(c.Changes, nowMs)
		if len(c.Changes) > maxChanges {
			c.Changes = c.Changes[len(c.Changes)-maxChanges:]
		}
	}
	c.LastStatus = ss.Status

	if inMaint {
		return nil
	}

	if ss.Status == StatusUp {
		c.LastUpAt = nowMs
		if c.ConsecFail > 0 && c.ConsecFail < p.openAfter {
			c.Blips++
		}
		if c.ConsecUp == 0 {
			c.UpStreakStart = nowMs
		}
		c.ConsecUp++
		c.ConsecFail = 0
		if c.ConsecUp == p.closeAfter {
			return &Event{Kind: EventRecovered, Service: ss.Name, Group: ss.Group, Status: StatusUp, At: c.UpStreakStart, Now: nowMs}
		}
		return nil
	}

	c.LastFailAt = nowMs
	c.LastFailText = truncate(ss.Detail, 160)
	if c.ConsecFail == 0 {
		c.FailStreakStart = nowMs
	}
	c.ConsecFail++
	c.ConsecUp = 0
	ev := &Event{Service: ss.Name, Group: ss.Group, Status: ss.Status, Detail: ss.Detail, Category: pd.Category, At: c.FailStreakStart, Now: nowMs, Checks: c.ConsecFail}
	switch {
	case c.ConsecFail == p.openAfter:
		ev.Kind = EventFailing
	case c.ConsecFail > p.openAfter:
		ev.Kind = EventStillFailing
	default:
		return nil
	}
	return ev
}

// dayMs is one UTC day in milliseconds.
const dayMs = int64(24 * time.Hour / time.Millisecond)

func floorTo(ms, step int64) int64 {
	if step <= 0 {
		return ms
	}
	return (ms / step) * step
}

// upsertBucket finds or appends the bucket starting at start, records the
// check in it, and trims the series to max.
func upsertBucket(buckets []Bucket, start int64, max int, ss ServiceStatus, inMaint bool) []Bucket {
	if len(buckets) == 0 || buckets[len(buckets)-1].T != start {
		buckets = append(buckets, Bucket{T: start})
		if max > 0 && len(buckets) > max {
			buckets = buckets[len(buckets)-max:]
		}
	}
	cur := &buckets[len(buckets)-1]
	switch {
	case inMaint:
		cur.Maint++
	case ss.Status == StatusUp:
		cur.Up++
	case ss.Status == StatusDegraded:
		cur.Degraded++
	case ss.Status == StatusDown:
		cur.Down++
	}
	if ss.LatencyMs != nil {
		cur.addLatency(*ss.LatencyMs)
	}
	return buckets
}

// rollupDaily rebuilds daily buckets from hourly ones. Used once, when an
// existing hourly history is loaded with no daily file beside it, so the
// 90-day view starts with the days the prober already saw instead of empty.
func rollupDaily(hourly []Bucket) []Bucket {
	var out []Bucket
	for _, b := range hourly {
		day := floorTo(b.T, dayMs)
		if len(out) == 0 || out[len(out)-1].T != day {
			out = append(out, Bucket{T: day})
		}
		out[len(out)-1].merge(b)
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	// Cut on a rune boundary.
	for n > 0 && n < len(s) && (s[n]&0xC0) == 0x80 {
		n--
	}
	return s[:n] + "…"
}
