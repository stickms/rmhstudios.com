package status

import (
	"math"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

// The View is the one computed model of the whole page: every statistic the
// dashboard shows, every JSON endpoint serves and every feed lists is derived
// here, once, from the prober's raw history and the incident store. Nothing
// downstream recomputes a percentage — which is how the strip, the number
// under it and the API can no longer disagree.

// UptimeWindow is one service's (or the platform's) record over a window.
type UptimeWindow struct {
	Label string `json:"label"`
	// UptimePct is up / (up+degraded+down): the strict number, the one the
	// error budget is spent against.
	UptimePct *float64 `json:"uptimePct"`
	// AvailabilityPct counts a degraded answer as available: the service
	// responded, just badly.
	AvailabilityPct *float64 `json:"availabilityPct"`
	Checks          int      `json:"checks"`
	Failed          int      `json:"failed"`
	Down            int      `json:"down"`
	// DowntimeSec estimates time spent failing: failed checks × probe interval.
	DowntimeSec int64 `json:"downtimeSec"`
	// Partial is true when less history exists than the window asks for.
	Partial bool `json:"partial"`
}

// LatencyStats summarises measured latencies over a window, in ms.
type LatencyStats struct {
	Window  string   `json:"window"`
	Samples int      `json:"samples"`
	Avg     *float64 `json:"avg"`
	Min     *float64 `json:"min"`
	Max     *float64 `json:"max"`
	P50     *float64 `json:"p50"`
	P95     *float64 `json:"p95"`
	P99     *float64 `json:"p99"`
	// Estimated is true when percentiles come from histogram bins rather than
	// raw samples.
	Estimated bool `json:"estimated"`
}

// ServiceView is everything known about one service.
type ServiceView struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description,omitempty"`
	Group       string `json:"group,omitempty"`
	// Status is the probe's verdict; Display overlays maintenance on it.
	Status        Status `json:"status"`
	Display       Status `json:"display"`
	InMaintenance bool   `json:"inMaintenance"`
	LatencyMs     *int64 `json:"latencyMs"`
	Detail        string `json:"detail"`
	CheckedAt     string `json:"checkedAt"`
	// UptimePct is the all-retained-hourly-history number /api/status serves.
	UptimePct *float64 `json:"uptimePct"`

	Windows    []UptimeWindow `json:"windows"`
	Latency1h  LatencyStats   `json:"latency1h"`
	Latency24h LatencyStats   `json:"latency24h"`
	// LatencyTrendPct compares the last hour's mean with the 24h mean.
	LatencyTrendPct *float64 `json:"latencyTrendPct"`
	// UptimeDeltaPct is the last 24h's uptime minus the 24h before it, in
	// percentage points.
	UptimeDeltaPct *float64 `json:"uptimeDeltaPct"`
	Apdex          *float64 `json:"apdex"`
	ApdexTMs       int64    `json:"apdexTMs"`
	BudgetMs       int64    `json:"budgetMs,omitempty"`
	Flapping       bool     `json:"flapping"`
	Changes1h      int      `json:"changes1h"`
	MTTRSec        *int64   `json:"mttrSec"`
	MTBFSec        *int64   `json:"mtbfSec"`
	Incidents30d   int      `json:"incidents30d"`
	OpenIncident   string   `json:"openIncident,omitempty"`
	TLSDaysLeft    *int     `json:"tlsDaysLeft"`

	Counters Counters    `json:"counters"`
	Probe    ProbeDetail `json:"probe"`
	Hourly   []Bucket    `json:"hourly"`
	Daily    []Bucket    `json:"daily"`
	Recent   []Sample    `json:"recent"`
}

// GroupView rolls a tier up.
type GroupView struct {
	Name      string   `json:"name"`
	Slug      string   `json:"slug"`
	Display   Status   `json:"display"`
	Services  int      `json:"services"`
	Healthy   int      `json:"healthy"`
	Uptime24h *float64 `json:"uptime24h"`
}

// PlatformKPIs are the headline numbers.
type PlatformKPIs struct {
	Windows        []UptimeWindow `json:"windows"`
	AvgLatency1h   *float64       `json:"avgLatency1h"`
	P95Latency1h   *float64       `json:"p95Latency1h"`
	ChecksTotal    int            `json:"checksTotal"`
	Checks24h      int            `json:"checks24h"`
	Incidents7d    int            `json:"incidents7d"`
	Incidents30d   int            `json:"incidents30d"`
	OpenIncidents  int            `json:"openIncidents"`
	MTTRSec        *int64         `json:"mttrSec"`
	Downtime30dSec int64          `json:"downtime30dSec"`
	Blips          int            `json:"blips"`
	Healthy        int            `json:"healthy"`
	Total          int            `json:"total"`
	Flapping       int            `json:"flapping"`
	CertsExpiring  int            `json:"certsExpiring"`
	Daily          []DayRollup    `json:"daily"`
}

// DayRollup is the platform's record for one UTC day.
type DayRollup struct {
	T         int64    `json:"t"`
	UptimePct *float64 `json:"uptimePct"`
	Checks    int      `json:"checks"`
	Failed    int      `json:"failed"`
	Down      int      `json:"down"`
	Incidents int      `json:"incidents"`
}

// SelfStats describe the prober itself.
type SelfStats struct {
	StartedAt    string  `json:"startedAt"`
	UptimeSec    int64   `json:"uptimeSec"`
	Cycles       int64   `json:"cycles"`
	LastCycleMs  float64 `json:"lastCycleMs"`
	AvgCycleMs   float64 `json:"avgCycleMs"`
	LastCycleAt  string  `json:"lastCycleAt,omitempty"`
	IntervalSec  float64 `json:"intervalSec"`
	TimeoutSec   float64 `json:"timeoutSec"`
	Targets      int     `json:"targets"`
	Goroutines   int     `json:"goroutines"`
	HeapMB       float64 `json:"heapMB"`
	GoVersion    string  `json:"goVersion"`
	LastSaveAt   string  `json:"lastSaveAt,omitempty"`
	LastSaveErr  string  `json:"lastSaveError,omitempty"`
	Persistence  bool    `json:"persistence"`
	BucketSec    float64 `json:"bucketSec"`
	MaxBuckets   int     `json:"maxBuckets"`
	MaxDays      int     `json:"maxDays"`
	RecentCap    int     `json:"recentCap"`
	Notifiers    int     `json:"webhooks"`
	AdminEnabled bool    `json:"adminEnabled"`
}

// View is the whole computed page.
type View struct {
	GeneratedAt time.Time `json:"-"`
	Generated   string    `json:"generatedAt"`
	Overall     Status    `json:"overall"`
	Display     Status    `json:"display"`
	Indicator   string    `json:"indicator"`
	Headline    string    `json:"headline"`
	CheckedAt   string    `json:"checkedAt"`

	Services      []ServiceView  `json:"services"`
	Groups        []GroupView    `json:"groups"`
	KPIs          PlatformKPIs   `json:"kpis"`
	SLO           SLOReport      `json:"slo"`
	Ongoing       []Incident     `json:"ongoingIncidents"`
	Incidents     []Incident     `json:"recentIncidents"`
	Maintenance   []Maintenance  `json:"maintenance"`
	Announcements []Announcement `json:"announcements"`
	Self          SelfStats      `json:"self"`

	Span       string        `json:"span"`
	BucketDur  time.Duration `json:"-"`
	MaxBuckets int           `json:"-"`
	MaxDays    int           `json:"-"`
	Interval   time.Duration `json:"-"`

	// Snap is the raw Node-compatible snapshot.
	Snap Snapshot `json:"-"`
}

// Service returns the named service view, or nil.
func (v *View) Service(slugOrName string) *ServiceView {
	for i := range v.Services {
		if v.Services[i].Slug == slugOrName || v.Services[i].Name == slugOrName {
			return &v.Services[i]
		}
	}
	return nil
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify turns a service name into a URL-safe identifier.
func Slugify(name string) string {
	s := strings.Trim(slugRe.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if s == "" {
		return "service"
	}
	return s
}

// svcData is a consistent copy of one service's raw state.
type svcData struct {
	target  Target
	last    ServiceStatus
	buckets []Bucket
	daily   []Bucket
	recent  []Sample
	detail  ProbeDetail
	ctr     Counters
}

func (p *Prober) data() []svcData {
	p.mu.RLock()
	defer p.mu.RUnlock()
	out := make([]svcData, 0, len(p.targets))
	for _, t := range p.targets {
		h := p.hist[t.Name]
		if h == nil {
			continue
		}
		h.mu.Lock()
		d := svcData{
			target:  t,
			last:    h.last,
			buckets: append([]Bucket(nil), h.buckets...),
			daily:   append([]Bucket(nil), h.daily...),
			recent:  append([]Sample(nil), h.recent...),
			detail:  h.detail,
		}
		if h.ctr != nil {
			d.ctr = *h.ctr
			d.ctr.Codes = copyCounts(h.ctr.Codes)
			d.ctr.Errors = copyCounts(h.ctr.Errors)
			d.ctr.Changes = append([]int64(nil), h.ctr.Changes...)
		}
		h.mu.Unlock()
		out = append(out, d)
	}
	return out
}

func (p *Prober) selfStats(startedAt, now time.Time) SelfStats {
	p.mu.RLock()
	defer p.mu.RUnlock()
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	s := SelfStats{
		StartedAt:   startedAt.UTC().Format(isoMillis),
		UptimeSec:   int64(now.Sub(startedAt).Seconds()),
		Cycles:      p.cycles,
		LastCycleMs: round1(float64(p.lastCycleDur.Microseconds()) / 1000),
		IntervalSec: p.interval.Seconds(),
		TimeoutSec:  p.timeout.Seconds(),
		Targets:     len(p.targets),
		Goroutines:  runtime.NumGoroutine(),
		HeapMB:      round1(float64(ms.HeapAlloc) / (1 << 20)),
		GoVersion:   runtime.Version(),
		LastSaveErr: p.lastSaveErr,
		Persistence: p.historyPath != "",
		BucketSec:   p.bucketDur.Seconds(),
		MaxBuckets:  p.maxBuckets,
		MaxDays:     p.maxDays,
		RecentCap:   p.recentCap,
	}
	if p.cycles > 0 {
		s.AvgCycleMs = round1(float64(p.totalCycleDur.Microseconds()) / 1000 / float64(p.cycles))
	}
	if !p.lastCycleAt.IsZero() {
		s.LastCycleAt = p.lastCycleAt.UTC().Format(isoMillis)
	}
	if !p.lastSaveAt.IsZero() {
		s.LastSaveAt = p.lastSaveAt.UTC().Format(isoMillis)
	}
	return s
}

func round1(f float64) float64 { return math.Round(f*10) / 10 }
func round2(f float64) float64 { return math.Round(f*100) / 100 }
func fptr(f float64) *float64  { return &f }
func iptr(i int64) *int64      { return &i }

// sumWindow merges every bucket overlapping the trailing window w.
func sumWindow(buckets []Bucket, bucketDur time.Duration, now time.Time, w time.Duration) (Bucket, bool) {
	var out Bucket
	cutoff := now.UnixMilli() - w.Milliseconds()
	durMs := bucketDur.Milliseconds()
	partial := true
	for _, b := range buckets {
		if b.T <= cutoff {
			partial = false
		}
		if b.T+durMs <= cutoff {
			continue
		}
		out.merge(b)
	}
	return out, partial
}

// sumRange merges buckets starting in [from, to).
func sumRange(buckets []Bucket, from, to int64) Bucket {
	var out Bucket
	for _, b := range buckets {
		if b.T >= from && b.T < to {
			out.merge(b)
		}
	}
	return out
}

func windowFromBucket(label string, b Bucket, interval time.Duration, partial bool) UptimeWindow {
	w := UptimeWindow{Label: label, Checks: b.Total(), Failed: b.Degraded + b.Down, Down: b.Down, Partial: partial}
	if t := b.Total(); t > 0 {
		w.UptimePct = fptr(float64(b.Up) / float64(t) * 100)
		w.AvailabilityPct = fptr(float64(b.Up+b.Degraded) / float64(t) * 100)
	}
	w.DowntimeSec = int64(float64(w.Failed) * interval.Seconds())
	return w
}

// bucketFromSamples aggregates raw samples since `from` (maintenance excluded
// from the uptime counts, as everywhere else).
func bucketFromSamples(samples []Sample, from int64) (Bucket, []int64) {
	var b Bucket
	var lats []int64
	for _, s := range samples {
		if s.T < from {
			continue
		}
		switch {
		case s.M:
			b.Maint++
		case s.S == StatusUp:
			b.Up++
		case s.S == StatusDegraded:
			b.Degraded++
		case s.S == StatusDown:
			b.Down++
		}
		if s.L != nil {
			b.addLatency(*s.L)
			lats = append(lats, *s.L)
		}
	}
	return b, lats
}

// exactLatency computes stats from raw latencies.
func exactLatency(window string, lats []int64) LatencyStats {
	ls := LatencyStats{Window: window, Samples: len(lats)}
	if len(lats) == 0 {
		return ls
	}
	sorted := append([]int64(nil), lats...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	var sum int64
	for _, l := range sorted {
		sum += l
	}
	pct := func(q float64) *float64 {
		// Nearest-rank: the smallest value with at least q of the data at or
		// below it — never an interpolated latency nobody experienced.
		idx := int(math.Ceil(q*float64(len(sorted)))) - 1
		if idx < 0 {
			idx = 0
		}
		return fptr(float64(sorted[idx]))
	}
	ls.Avg = fptr(round1(float64(sum) / float64(len(sorted))))
	ls.Min = fptr(float64(sorted[0]))
	ls.Max = fptr(float64(sorted[len(sorted)-1]))
	ls.P50, ls.P95, ls.P99 = pct(0.5), pct(0.95), pct(0.99)
	return ls
}

// histLatency estimates stats from a bucket's histogram.
func histLatency(window string, b Bucket) LatencyStats {
	ls := LatencyStats{Window: window, Samples: b.LatN, Estimated: true}
	if b.LatN == 0 {
		return ls
	}
	ls.Avg = fptr(round1(float64(b.LatSum) / float64(b.LatN)))
	ls.Min = fptr(float64(b.LatMin))
	ls.Max = fptr(float64(b.LatMax))
	ls.P50 = fptr(round1(histQuantile(b, 0.5)))
	ls.P95 = fptr(round1(histQuantile(b, 0.95)))
	ls.P99 = fptr(round1(histQuantile(b, 0.99)))
	return ls
}

// histQuantile linearly interpolates quantile q inside the histogram bin it
// falls in, clamped to the observed min/max so an estimate never exceeds what
// was actually seen.
func histQuantile(b Bucket, q float64) float64 {
	if b.LatN == 0 || len(b.LatHist) == 0 {
		return 0
	}
	target := q * float64(b.LatN)
	cum := 0.0
	for i, n := range b.LatHist {
		if n == 0 {
			continue
		}
		if cum+float64(n) >= target {
			lo := 0.0
			if i > 0 {
				lo = float64(latencyBounds[i-1])
			}
			hi := float64(b.LatMax)
			if i < len(latencyBounds) {
				hi = float64(latencyBounds[i])
			}
			v := lo + (hi-lo)*((target-cum)/float64(n))
			return math.Max(float64(b.LatMin), math.Min(float64(b.LatMax), v))
		}
		cum += float64(n)
	}
	return float64(b.LatMax)
}

// apdexT is the satisfied threshold for a target: a quarter of its latency
// budget, or 500ms when it has none.
func apdexT(t Target) time.Duration {
	if t.DegradedAfter > 0 {
		return t.DegradedAfter / 4
	}
	return 500 * time.Millisecond
}

// apdex scores raw samples: satisfied (up within T) count 1, tolerating
// (answered within 4T) count ½, everything else — failures included — 0.
func apdex(samples []Sample, from int64, T time.Duration) *float64 {
	tMs := T.Milliseconds()
	var sat, tol, all float64
	for _, s := range samples {
		if s.T < from || s.M {
			continue
		}
		all++
		if s.L == nil || s.S == StatusDown {
			continue
		}
		switch {
		case s.S == StatusUp && *s.L <= tMs:
			sat++
		case *s.L <= 4*tMs:
			tol++
		}
	}
	if all == 0 {
		return nil
	}
	return fptr(round2((sat + tol/2) / all))
}

// flapThreshold is how many state changes in an hour make a service flapping.
const flapThreshold = 4

// Severity of a single bar in an uptime strip. A bar summarises hundreds of
// checks, so it is classified by the SHARE that failed rather than by the
// single worst one — the old rule painted an hour red for one 15-second
// timeout out of 240, which is how a 99.4% service ended up looking like an
// outage.
const (
	// BlipRatio: fewer than 2% of the bucket's checks failed (at most 4 of the
	// 240 in an hour — about a minute). Shown green with a small marker: real,
	// worth hovering, not an outage. At 1% a service sitting at 99.4% — one or
	// two stray timeouts an hour — still painted a fifth of its hours amber.
	BlipRatio = 0.02
	// MajorDownRatio: at least 10% of the checks were hard-down (≥6 minutes
	// of an hour). Shown red.
	MajorDownRatio = 0.10
)

// BarSeverity classifies a bucket for display: "empty", "maint", "up",
// "blip", "degraded" or "down".
func BarSeverity(b Bucket) string {
	t := b.Total()
	if t == 0 {
		if b.Maint > 0 {
			return "maint"
		}
		return "empty"
	}
	bad := float64(b.Degraded + b.Down)
	switch {
	case bad == 0:
		return "up"
	case float64(b.Down)/float64(t) >= MajorDownRatio:
		return "down"
	case bad/float64(t) < BlipRatio:
		return "blip"
	}
	return "degraded"
}

// displayOverall folds the display states into one verdict. Maintenance sits
// between up and degraded: it is announced, so it is not a fault, but the page
// should not claim everything is untouched either.
func displayOverall(svcs []ServiceView) Status {
	rank := map[Status]int{StatusUnknown: 0, StatusUp: 1, StatusMaintenance: 2, StatusDegraded: 3, StatusDown: 4}
	worst := StatusUnknown
	anyKnown := false
	for _, s := range svcs {
		if s.Display == StatusUnknown {
			continue
		}
		anyKnown = true
		if rank[s.Display] > rank[worst] {
			worst = s.Display
		}
	}
	if !anyKnown {
		return StatusUnknown
	}
	return worst
}

// indicatorFor maps the platform state onto the Statuspage indicator
// vocabulary (none / minor / major / critical / maintenance).
func indicatorFor(display Status, svcs []ServiceView, ongoing []Incident) string {
	ind := "none"
	switch display {
	case StatusDegraded:
		ind = "minor"
	case StatusDown:
		ind = "major"
		for _, s := range svcs {
			if s.Display == StatusDown && s.Group == "Core" {
				ind = "critical"
			}
		}
	case StatusMaintenance:
		ind = "maintenance"
	}
	for _, inc := range ongoing {
		if impactRank[inc.Impact] > impactRank[ind] || (ind == "maintenance" && inc.Impact != ImpactNone) {
			ind = inc.Impact
		}
	}
	return ind
}

// BuildView computes the page model.
func BuildView(p *Prober, store *Store, slo SLOConfig, startedAt, now time.Time) *View {
	data := p.data()
	snap := p.Snapshot()

	var incidents []Incident
	var maint []Maintenance
	var anns []Announcement
	if store != nil {
		incidents = store.Incidents()
		maint = store.Maintenances()
		anns = store.Announcements(now)
	}

	nowMs := now.UnixMilli()
	hourAgo := nowMs - time.Hour.Milliseconds()
	dayAgo := nowMs - dayMs
	monthAgo := nowMs - 30*dayMs

	v := &View{
		GeneratedAt: now,
		Generated:   now.UTC().Format(isoMillis),
		Overall:     overallStatus(snap),
		CheckedAt:   latestCheckedAt(snap),
		SLO:         p.SLO(slo, now),
		BucketDur:   p.bucketDur,
		MaxBuckets:  p.maxBuckets,
		MaxDays:     p.maxDays,
		Interval:    p.interval,
		Span:        formatSpan(p.bucketDur, p.maxBuckets),
		Snap:        snap,
		Self:        p.selfStats(startedAt, now),
	}

	for _, inc := range incidents {
		if !inc.Resolved() {
			v.Ongoing = append(v.Ongoing, inc)
		}
	}
	for i, inc := range incidents {
		if i >= 50 {
			break
		}
		v.Incidents = append(v.Incidents, inc)
	}
	for _, m := range maint {
		st := m.State(now)
		if st == MaintScheduled || st == MaintInProgress || (st == MaintCompleted && nowMs-m.EndsAt < dayMs) {
			v.Maintenance = append(v.Maintenance, m)
		}
	}
	v.Announcements = anns

	// Platform-wide aggregates, filled while walking the services.
	var plat1h, plat24h, plat7d, plat30d, plat90d Bucket
	var platLats []int64
	dayAgg := map[int64]*Bucket{}

	for i, d := range data {
		ss := snap.Services[i]
		sv := ServiceView{
			Name:        ss.Name,
			Slug:        Slugify(ss.Name),
			Description: ss.Description,
			Group:       ss.Group,
			Status:      ss.Status,
			Display:     ss.Status,
			LatencyMs:   ss.LatencyMs,
			Detail:      ss.Detail,
			CheckedAt:   ss.CheckedAt,
			UptimePct:   ss.UptimePct,
			Counters:    d.ctr,
			Probe:       d.detail,
			Hourly:      d.buckets,
			Daily:       d.daily,
			Recent:      d.recent,
			ApdexTMs:    apdexT(d.target).Milliseconds(),
			BudgetMs:    d.target.DegradedAfter.Milliseconds(),
		}
		for _, m := range maint {
			if m.Covers(d.target.Name, now) {
				sv.InMaintenance = true
			}
		}
		// Inside a window the component reads "maintenance" whatever the
		// probe says — the window is the explanation for anything it sees.
		if sv.InMaintenance {
			sv.Display = StatusMaintenance
		}

		// Windows: the last hour from raw samples (exact), a day from hourly
		// buckets, the long windows from the daily rollup.
		b1h, lats1h := bucketFromSamples(d.recent, hourAgo)
		partial1h := len(d.recent) == 0 || d.recent[0].T > hourAgo
		b24, p24 := sumWindow(d.buckets, p.bucketDur, now, 24*time.Hour)
		b7, p7 := sumWindow(d.daily, 24*time.Hour, now, 7*24*time.Hour)
		b30, p30 := sumWindow(d.daily, 24*time.Hour, now, 30*24*time.Hour)
		b90, p90 := sumWindow(d.daily, 24*time.Hour, now, 90*24*time.Hour)
		sv.Windows = []UptimeWindow{
			windowFromBucket("1h", b1h, p.interval, partial1h),
			windowFromBucket("24h", b24, p.interval, p24),
			windowFromBucket("7d", b7, p.interval, p7),
			windowFromBucket("30d", b30, p.interval, p30),
			windowFromBucket("90d", b90, p.interval, p90),
		}
		plat1h.merge(b1h)
		plat24h.merge(b24)
		plat7d.merge(b7)
		plat30d.merge(b30)
		plat90d.merge(b90)
		platLats = append(platLats, lats1h...)
		for _, db := range d.daily {
			agg := dayAgg[db.T]
			if agg == nil {
				agg = &Bucket{T: db.T}
				dayAgg[db.T] = agg
			}
			agg.merge(db)
		}

		sv.Latency1h = exactLatency("1h", lats1h)
		sv.Latency24h = histLatency("24h", b24)
		if sv.Latency1h.Avg != nil && sv.Latency24h.Avg != nil && *sv.Latency24h.Avg > 0 {
			sv.LatencyTrendPct = fptr(round1((*sv.Latency1h.Avg - *sv.Latency24h.Avg) / *sv.Latency24h.Avg * 100))
		}
		prev := sumRange(d.buckets, floorTo(nowMs-2*dayMs, p.bucketDur.Milliseconds()), floorTo(dayAgo, p.bucketDur.Milliseconds()))
		if prev.Total() > 0 && b24.Total() > 0 {
			cur := float64(b24.Up) / float64(b24.Total()) * 100
			old := float64(prev.Up) / float64(prev.Total()) * 100
			sv.UptimeDeltaPct = fptr(round2(cur - old))
		}
		sv.Apdex = apdex(d.recent, hourAgo, apdexT(d.target))

		for _, c := range d.ctr.Changes {
			if c >= hourAgo {
				sv.Changes1h++
			}
		}
		sv.Flapping = sv.Changes1h >= flapThreshold

		if d.detail.TLS != nil && d.detail.TLS.NotAfter > 0 {
			days := int((d.detail.TLS.NotAfter - nowMs) / dayMs)
			sv.TLSDaysLeft = &days
		}

		// MTTR / MTBF over the incidents that touched this service in 30 days.
		var resolvedDur, totalDur time.Duration
		resolved := 0
		for _, inc := range incidents {
			if !containsStr(inc.Components, d.target.Name) {
				continue
			}
			if inc.StartedAt < monthAgo && inc.Resolved() && inc.ResolvedAt < monthAgo {
				continue
			}
			sv.Incidents30d++
			dur := inc.Duration(now)
			totalDur += dur
			if inc.Resolved() {
				resolved++
				resolvedDur += dur
			} else if sv.OpenIncident == "" {
				sv.OpenIncident = inc.ID
			}
		}
		if resolved > 0 {
			sv.MTTRSec = iptr(int64((resolvedDur / time.Duration(resolved)).Seconds()))
		}
		if sv.Incidents30d > 0 && d.ctr.FirstSeenAt > 0 {
			observed := time.Duration(nowMs-maxInt64(d.ctr.FirstSeenAt, monthAgo)) * time.Millisecond
			if up := observed - totalDur; up > 0 {
				sv.MTBFSec = iptr(int64((up / time.Duration(sv.Incidents30d)).Seconds()))
			}
		}

		v.Services = append(v.Services, sv)
	}

	v.Display = displayOverall(v.Services)
	if len(v.Services) == 0 {
		v.Display = StatusUnknown
	}
	v.Indicator = indicatorFor(v.Display, v.Services, v.Ongoing)
	v.Headline = headlineFor(v.Display, v.Indicator)

	// Groups, in first-seen order.
	idx := map[string]int{}
	for _, s := range v.Services {
		i, ok := idx[s.Group]
		if !ok {
			i = len(v.Groups)
			idx[s.Group] = i
			v.Groups = append(v.Groups, GroupView{Name: s.Group, Slug: Slugify(s.Group), Display: StatusUnknown})
		}
		g := &v.Groups[i]
		g.Services++
		if s.Display == StatusUp {
			g.Healthy++
		}
		g.Display = displayOverall([]ServiceView{{Display: g.Display}, {Display: s.Display}})
	}
	for i := range v.Groups {
		var agg Bucket
		for _, s := range v.Services {
			if s.Group == v.Groups[i].Name {
				b24, _ := sumWindow(s.Hourly, p.bucketDur, now, 24*time.Hour)
				agg.merge(b24)
			}
		}
		if agg.Total() > 0 {
			v.Groups[i].Uptime24h = fptr(float64(agg.Up) / float64(agg.Total()) * 100)
		}
	}

	// Platform KPIs.
	k := &v.KPIs
	k.Windows = []UptimeWindow{
		windowFromBucket("1h", plat1h, p.interval, false),
		windowFromBucket("24h", plat24h, p.interval, false),
		windowFromBucket("7d", plat7d, p.interval, false),
		windowFromBucket("30d", plat30d, p.interval, false),
		windowFromBucket("90d", plat90d, p.interval, false),
	}
	if pl := exactLatency("1h", platLats); pl.Samples > 0 {
		k.AvgLatency1h, k.P95Latency1h = pl.Avg, pl.P95
	}
	k.Checks24h = plat24h.Total() + plat24h.Maint
	k.Downtime30dSec = int64(float64(plat30d.Degraded+plat30d.Down) * p.interval.Seconds())
	k.Total = len(v.Services)
	for _, s := range v.Services {
		k.ChecksTotal += s.Counters.Checks
		k.Blips += s.Counters.Blips
		if s.Display == StatusUp {
			k.Healthy++
		}
		if s.Flapping {
			k.Flapping++
		}
		if s.TLSDaysLeft != nil && *s.TLSDaysLeft < 14 {
			k.CertsExpiring++
		}
	}
	var resolvedDur time.Duration
	resolved := 0
	for _, inc := range incidents {
		if !inc.Resolved() {
			k.OpenIncidents++
		}
		if inc.StartedAt >= nowMs-7*dayMs {
			k.Incidents7d++
		}
		if inc.StartedAt >= monthAgo {
			k.Incidents30d++
			if inc.Resolved() {
				resolved++
				resolvedDur += inc.Duration(now)
			}
		}
	}
	if resolved > 0 {
		k.MTTRSec = iptr(int64((resolvedDur / time.Duration(resolved)).Seconds()))
	}

	// The 90-day platform calendar, oldest first, one entry per day even when
	// the prober saw nothing that day.
	firstDay := floorTo(nowMs, dayMs) - int64(p.maxDays-1)*dayMs
	for d := 0; d < p.maxDays; d++ {
		t := firstDay + int64(d)*dayMs
		dr := DayRollup{T: t}
		if agg := dayAgg[t]; agg != nil && agg.Total() > 0 {
			dr.Checks = agg.Total()
			dr.Failed = agg.Degraded + agg.Down
			dr.Down = agg.Down
			dr.UptimePct = fptr(float64(agg.Up) / float64(agg.Total()) * 100)
		}
		for _, inc := range incidents {
			if inc.StartedAt >= t && inc.StartedAt < t+dayMs {
				dr.Incidents++
			}
		}
		k.Daily = append(k.Daily, dr)
	}

	return v
}

func headlineFor(display Status, indicator string) string {
	switch {
	case indicator == "critical" || display == StatusDown:
		return statusMetaMap[StatusDown].headline
	case display == StatusDegraded:
		return statusMetaMap[StatusDegraded].headline
	case indicator == "major":
		return "Major service disruption"
	case indicator == "minor":
		return "Minor service disruption"
	case display == StatusMaintenance:
		return "Scheduled maintenance in progress"
	}
	return statusMetaMap[display].headline
}

func containsStr(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
