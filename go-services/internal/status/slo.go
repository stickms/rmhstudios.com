package status

import (
	"math"
	"sort"
	"strconv"
	"time"
)

// Multi-window burn-rate alerting (E14).
//
// docs/performance-slo.md defines the targets. Nothing computed an error budget
// against them, and nothing alerted on the RATE at which one is being spent —
// which is the part that matters. Alerting on an instantaneous error rate pages
// on every blip and misses the slow bleed that actually exhausts a budget: a
// service failing 2% of the time for a day never trips a "5% for 5 minutes"
// rule and burns a month of budget doing it.
//
// The standard two-window form fixes both ends. A FAST window (1h) catches a
// real outage quickly. A SLOW window (6h) has to agree before anything pages,
// which suppresses the blip — a 90-second incident spikes the 1h rate and
// barely moves the 6h one. Both must exceed their thresholds, so the alert
// means "we are burning budget fast AND have been for a while".
//
// The data source is the prober's own rolling buckets. That is deliberate: the
// status service already probes every surface through the real user path, on a
// fixed interval, and persists the history across restarts. Feeding this from
// the RUM beacons instead would make the alert depend on somebody having a tab
// open, which is exactly wrong for an outage.

// Burn is the error-budget consumption rate over two windows, expressed as a
// multiple of the budget's sustainable spend. 1.0 means "on track to spend
// exactly the budget over the SLO period"; 14.4 means "spending it 14.4× as
// fast", i.e. a 30-day budget gone in ~50 hours.
type Burn struct {
	Fast float64
	Slow float64
}

// Google SRE's canonical thresholds for a 1h/6h pair against a 30-day budget:
// 14.4× over an hour spends 2% of the budget, and requiring 6× over six hours
// as well is what stops a short spike from paging anyone.
const (
	FastBurnThreshold = 14.4
	SlowBurnThreshold = 6.0
)

// ShouldPage reports whether both windows agree that budget is being burned
// dangerously fast. Both, not either: the fast window catches the outage, the
// slow window suppresses the blip.
func ShouldPage(b Burn) bool {
	return b.Fast > FastBurnThreshold && b.Slow > SlowBurnThreshold
}

// SLOConfig parameterises the burn-rate calculation.
type SLOConfig struct {
	// Target availability as a fraction, e.g. 0.999. The error budget is
	// 1-Target.
	Target float64
	// FastWindow is the short window — catches an outage. Default 1h.
	FastWindow time.Duration
	// SlowWindow is the long window — suppresses a blip. Default 6h.
	SlowWindow time.Duration
	// BudgetWindow is the SLO period the remaining budget is measured over.
	// Default 30 days, silently capped at how much history the prober actually
	// retains (BucketDur × MaxBuckets) — reporting "30-day budget" off 90 hours
	// of data would be a lie told with a straight face.
	BudgetWindow time.Duration
}

func (c SLOConfig) normalise() SLOConfig {
	if c.Target <= 0 || c.Target >= 1 {
		c.Target = 0.999
	}
	if c.FastWindow <= 0 {
		c.FastWindow = time.Hour
	}
	if c.SlowWindow <= 0 {
		c.SlowWindow = 6 * time.Hour
	}
	if c.BudgetWindow <= 0 {
		c.BudgetWindow = 30 * 24 * time.Hour
	}
	return c
}

// ServiceSLO is one service's burn-rate and error-budget position.
type ServiceSLO struct {
	Name  string `json:"name"`
	Group string `json:"group,omitempty"`
	// BurnFast/BurnSlow are budget-consumption multiples over the two windows.
	BurnFast float64 `json:"burnFast"`
	BurnSlow float64 `json:"burnSlow"`
	// Samples backing each window. A window with no samples cannot page — a
	// service nobody has probed is unknown, not broken.
	FastSamples int `json:"fastSamples"`
	SlowSamples int `json:"slowSamples"`
	// BudgetRemaining is the fraction of the period's error budget still
	// unspent, 0..1. Exactly 0 means the budget is gone, not that the service
	// is down.
	BudgetRemaining float64 `json:"budgetRemaining"`
	// BudgetSamples backs BudgetRemaining. Zero means "no data", which is
	// reported as a full budget rather than an exhausted one.
	BudgetSamples int `json:"budgetSamples"`
	// Page is ShouldPage(Burn{BurnFast, BurnSlow}).
	Page bool `json:"page"`
}

// Burn returns the pair in the form ShouldPage takes.
func (s ServiceSLO) Burn() Burn { return Burn{Fast: s.BurnFast, Slow: s.BurnSlow} }

// SLOReport is the whole fleet's position — the payload behind /api/slo and the
// error-budget row on the dashboard.
type SLOReport struct {
	// Target availability, e.g. 0.999.
	Target float64 `json:"target"`
	// ErrorBudget is 1-Target, restated so a consumer does not re-derive it.
	ErrorBudget float64 `json:"errorBudget"`
	FastWindow  string  `json:"fastWindow"`
	SlowWindow  string  `json:"slowWindow"`
	// BudgetWindow is what BudgetRemaining is measured over — the CONFIGURED
	// period capped by retained history, so it can read "90h" on a fresh box.
	BudgetWindow string `json:"budgetWindow"`
	// Page is true when ANY service pages.
	Page bool `json:"page"`
	// WorstRemaining is the lowest BudgetRemaining across services — the number
	// the public status page shows, because a platform is as healthy as its
	// least healthy dependency.
	WorstRemaining float64      `json:"worstRemaining"`
	Services       []ServiceSLO `json:"services"`
	GeneratedAt    string       `json:"generatedAt"`
}

// SLO computes the burn-rate report from the prober's rolling history.
//
// `now` is injected rather than read from the clock so the calculation is
// testable without sleeping.
func (p *Prober) SLO(cfg SLOConfig, now time.Time) SLOReport {
	cfg = cfg.normalise()

	p.mu.RLock()
	bucketDur := p.bucketDur
	retained := time.Duration(p.maxBuckets) * p.bucketDur
	targets := make([]Target, len(p.targets))
	copy(targets, p.targets)
	histories := make(map[string][]Bucket, len(p.hist))
	for name, h := range p.hist {
		h.mu.Lock()
		buckets := make([]Bucket, len(h.buckets))
		copy(buckets, h.buckets)
		h.mu.Unlock()
		histories[name] = buckets
	}
	p.mu.RUnlock()

	// A "30-day error budget" computed off 90 hours of retained buckets is a
	// lie. Report the window we can actually see.
	budgetWindow := cfg.BudgetWindow
	if retained > 0 && retained < budgetWindow {
		budgetWindow = retained
	}

	errorBudget := 1 - cfg.Target
	report := SLOReport{
		Target:         cfg.Target,
		ErrorBudget:    errorBudget,
		FastWindow:     shortDuration(cfg.FastWindow),
		SlowWindow:     shortDuration(cfg.SlowWindow),
		BudgetWindow:   shortDuration(budgetWindow),
		WorstRemaining: 1,
		Services:       make([]ServiceSLO, 0, len(targets)),
		GeneratedAt:    now.UTC().Format("2006-01-02T15:04:05.000Z07:00"),
	}

	for _, t := range targets {
		buckets := histories[t.Name]

		fastBad, fastAll := window(buckets, bucketDur, now, cfg.FastWindow)
		slowBad, slowAll := window(buckets, bucketDur, now, cfg.SlowWindow)
		budgetBad, budgetAll := window(buckets, bucketDur, now, budgetWindow)

		svc := ServiceSLO{
			Name:            t.Name,
			Group:           t.Group,
			BurnFast:        burnRate(fastBad, fastAll, errorBudget),
			BurnSlow:        burnRate(slowBad, slowAll, errorBudget),
			FastSamples:     fastAll,
			SlowSamples:     slowAll,
			BudgetSamples:   budgetAll,
			BudgetRemaining: remainingBudget(budgetBad, budgetAll, errorBudget),
		}
		svc.Page = ShouldPage(svc.Burn())

		if svc.Page {
			report.Page = true
		}
		if svc.BudgetRemaining < report.WorstRemaining {
			report.WorstRemaining = svc.BudgetRemaining
		}
		report.Services = append(report.Services, svc)
	}

	// Worst first: the reason to open this page is to find what is spending the
	// budget, and that should not require scrolling past six healthy services.
	sort.SliceStable(report.Services, func(i, j int) bool {
		return report.Services[i].BudgetRemaining < report.Services[j].BudgetRemaining
	})

	return report
}

// window sums bad and total samples over the trailing duration `w`.
//
// A bucket is included when any part of it overlaps the window, so a 1h window
// against 1h buckets sees the current (partial) bucket plus whatever of the
// previous one overlaps. That over-counts slightly at the edge, in the
// direction of reporting MORE history — which is the safe direction for an
// alert that already requires two windows to agree.
//
// `bad` is degraded + down, matching the uptime percentage the dashboard has
// always shown: a service answering in eight seconds is not meeting an
// availability target just because it answered. `unknown` samples are never
// recorded into buckets at all (see ProbeOnce), so an unconfigured service
// cannot spend a budget.
func window(buckets []Bucket, bucketDur time.Duration, now time.Time, w time.Duration) (bad, all int) {
	if bucketDur <= 0 {
		return 0, 0
	}
	cutoff := now.UnixMilli() - w.Milliseconds()
	durMs := bucketDur.Milliseconds()

	for _, b := range buckets {
		if b.T+durMs <= cutoff {
			continue
		}
		bad += b.Degraded + b.Down
		all += b.Up + b.Degraded + b.Down
	}
	return bad, all
}

// burnRate converts an observed failure ratio into a multiple of the budget's
// sustainable spend rate.
//
// No samples ⇒ 0. A service the prober has not reached in the window is
// unknown, and paging on unknown is how a status service becomes the thing
// everyone mutes.
func burnRate(bad, all int, errorBudget float64) float64 {
	if all == 0 || errorBudget <= 0 {
		return 0
	}
	return (float64(bad) / float64(all)) / errorBudget
}

// remainingBudget is the unspent fraction of the period's error budget, 0..1.
//
// No samples ⇒ 1 (full). "We have not measured" must not render as "you have
// no budget left", which would make the number permanently alarming on a fresh
// deploy and permanently ignored thereafter.
func remainingBudget(bad, all int, errorBudget float64) float64 {
	if all == 0 || errorBudget <= 0 {
		return 1
	}
	consumed := (float64(bad) / float64(all)) / errorBudget
	return math.Max(0, math.Min(1, 1-consumed))
}

// shortDuration renders a window the way an operator says it: "1h", "6h",
// "30d". Go's own String() gives "720h0m0s", which is technically correct and
// unreadable on a status page.
func shortDuration(d time.Duration) string {
	switch {
	case d >= 24*time.Hour && d%(24*time.Hour) == 0:
		return strconv.Itoa(int(d/(24*time.Hour))) + "d"
	case d >= time.Hour && d%time.Hour == 0:
		return strconv.Itoa(int(d/time.Hour)) + "h"
	case d >= time.Minute:
		return strconv.Itoa(int(d/time.Minute)) + "m"
	default:
		return strconv.Itoa(int(d/time.Second)) + "s"
	}
}
