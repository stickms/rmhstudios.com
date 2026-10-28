package status

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"runtime/debug"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The evidence block appended to every on-call alarm (alertFor builds the
// alarm; Diagnoser builds this). The page says WHAT is failing; this says what
// the prober, its neighbours and the host looked like when it did, so the
// person paged can tell a shared front-door stall from one broken route from a
// starved box without logging in first.
//
// SECURITY — the block is written to a Discord channel and stored by the
// watchdog, so it is built from an allowlist of facts, never from "whatever the
// probe learned":
//
//   - included: service names, status/latency/category, phase timings, counts,
//     the address FAMILY (never an address), URL path of a public https target,
//     Go runtime and cgroup/proc numbers, build revision, uptimes;
//   - never included: environment, headers, cookies, response bodies, resolved
//     or peer IP addresses, internal hostnames and URLs, file paths, tokens;
//   - every free-text field (probe error strings) goes through diagText, which
//     strips IP literals, URL hosts, control characters and backticks, and
//     bounds the length.
//
// The whole block is capped at diagMaxBytes so it fits the watchdog's detail
// limit (3500 chars) beside the alarm's own text.
const diagMaxBytes = 2800

// Diagnoser builds the evidence block. A nil *Diagnoser yields "".
type Diagnoser struct {
	prober  *Prober
	started time.Time

	// procRoot / cgroupRoot are overridable for tests.
	procRoot   string
	cgroupRoot string

	mu   sync.Mutex
	ring []cgSample // newest last
}

// cgSample is one reading of the container's CPU-throttle counters.
type cgSample struct {
	at                       time.Time
	periods, throttled, usec int64
}

const cgRingCap = 48 // 12 minutes at the default 15s cadence

// NewDiagnoser returns a diagnoser reading from p. started is the process start.
func NewDiagnoser(p *Prober, started time.Time) *Diagnoser {
	return &Diagnoser{prober: p, started: started, procRoot: "/proc", cgroupRoot: "/sys/fs/cgroup"}
}

// Sample records the container's CPU-throttle counters. Called once per probe
// cycle so a report can show how much the container was throttled DURING the
// failure, not just since it started.
func (d *Diagnoser) Sample(now time.Time) {
	if d == nil {
		return
	}
	st := readKV(filepath.Join(d.cgroupRoot, "cpu.stat"))
	if st == nil {
		return
	}
	d.mu.Lock()
	d.ring = append(d.ring, cgSample{at: now, periods: st["nr_periods"], throttled: st["nr_throttled"], usec: st["throttled_usec"]})
	if len(d.ring) > cgRingCap {
		d.ring = d.ring[len(d.ring)-cgRingCap:]
	}
	d.mu.Unlock()
}

// Report is the evidence block for an alarm about service, "now".
func (d *Diagnoser) Report(service string, now time.Time) string {
	if d == nil || d.prober == nil {
		return ""
	}
	in, ok := d.prober.diagInput(service)
	if !ok {
		return ""
	}
	in.now = now
	in.host = d.hostLines(in.failSince, now)
	in.proc = d.processLine(now)
	return renderDiag(in)
}

// diagService is one service's current state, for the "everything right now"
// table: the shared-stall-or-not question is answered by this table.
type diagService struct {
	Name     string
	Status   Status
	Latency  *int64
	Category string
	Detail   string
}

// diagInput is everything renderDiag needs, so it can be tested without a Prober.
type diagInput struct {
	now       time.Time
	service   string
	group     string
	targetURL string
	interval  time.Duration
	timeout   time.Duration
	failSince time.Time // zero when the service is not currently failing
	consec    int
	recent    []Sample
	counters  Counters
	last      ServiceStatus
	detail    ProbeDetail
	all       []diagService
	cycles    int64
	lastCycle time.Duration
	avgCycle  time.Duration
	host      []string
	proc      string
}

// diagInput snapshots the prober's state for one service.
func (p *Prober) diagInput(service string) (diagInput, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	h := p.hist[service]
	if h == nil {
		return diagInput{}, false
	}
	in := diagInput{service: service, interval: p.interval, timeout: p.timeout, cycles: p.cycles, lastCycle: p.lastCycleDur}
	if p.cycles > 0 {
		in.avgCycle = p.totalCycleDur / time.Duration(p.cycles)
	}
	for _, t := range p.targets {
		hh := p.hist[t.Name]
		if hh == nil {
			continue
		}
		hh.mu.Lock()
		ds := diagService{Name: t.Name, Status: hh.last.Status, Latency: hh.last.LatencyMs, Category: hh.detail.Category, Detail: hh.last.Detail}
		if t.Name == service {
			in.group, in.targetURL = t.Group, t.URL
			in.recent = append([]Sample(nil), hh.recent...)
			in.counters = *hh.ctr
			in.counters.Errors = copyMap(hh.ctr.Errors)
			in.counters.Codes = nil
			in.counters.Changes = append([]int64(nil), hh.ctr.Changes...)
			in.last, in.detail = hh.last, hh.detail
			in.consec = hh.ctr.ConsecFail
			if hh.ctr.ConsecFail > 0 && hh.ctr.FailStreakStart > 0 {
				in.failSince = time.UnixMilli(hh.ctr.FailStreakStart)
			}
		}
		hh.mu.Unlock()
		in.all = append(in.all, ds)
	}
	return in, true
}

func copyMap(m map[string]int) map[string]int {
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// renderDiag formats the block. Pure: all I/O happened in the caller.
func renderDiag(in diagInput) string {
	var b strings.Builder
	w := func(format string, a ...any) { fmt.Fprintf(&b, format+"\n", a...) }
	clock := func(t time.Time) string { return t.UTC().Format("15:04:05") }

	w("── diagnostics · %s UTC ──", clock(in.now))
	w("target   %s · group %s · probe every %s, timeout %s", targetLabel(in.targetURL), orDash(in.group), in.interval, in.timeout)
	if !in.failSince.IsZero() {
		w("failing  %d checks since %s UTC (%s)", in.consec, clock(in.failSince), HumanDuration(in.now.Sub(in.failSince)))
	}

	if ph := in.detail.Phases; ph != nil {
		w("last req  dns %s · connect %s · tls %s · ttfb %s · total %s · %s",
			ms(ph.DNS), ms(ph.Connect), ms(ph.TLS), ms(ph.TTFB), ms(ph.Total), connLabel(ph))
		if ph.Family != "" || ph.Addrs > 0 {
			w("          first connect %s · %d connect attempt(s) · DNS returned %d address(es)", orDash(ph.Family), ph.Attempts, ph.Addrs)
		}
	}
	if in.detail.Code > 0 || in.detail.Proto != "" {
		w("          http %s · %s · %d bytes", codeLabel(in.detail.Code), orDash(in.detail.Proto), in.detail.Bytes)
	}
	if t := in.detail.TLS; t != nil && t.NotAfter > 0 {
		w("          cert expires in %.0f days (%s)", time.UnixMilli(t.NotAfter).Sub(in.now).Hours()/24, orDash(diagText(t.Issuer, 50)))
	}

	// This service's last checks: is it a step change, a ramp, or a flap?
	if n := len(in.recent); n > 0 {
		from := n - 8
		if from < 0 {
			from = 0
		}
		w("recent checks (oldest first)")
		for _, s := range in.recent[from:] {
			lat := "—"
			if s.L != nil {
				lat = fmt.Sprintf("%dms", *s.L)
			}
			line := fmt.Sprintf("  %s  %-8s %7s", clock(time.UnixMilli(s.T)), s.S, lat)
			if s.S != StatusUp {
				line += "  " + diagText(strings.TrimSpace(s.E+" "+s.D), 70)
			}
			w("%s", line)
		}
	}

	// The question that decides the whole diagnosis: did anything else fail with it?
	var failing []string
	for _, s := range in.all {
		if s.Status != StatusUp {
			failing = append(failing, s.Name)
		}
	}
	w("all services now (%d of %d not up: %s)", len(failing), len(in.all), joinOrNone(failing))
	for _, s := range in.all {
		lat := "—"
		if s.Latency != nil {
			lat = fmt.Sprintf("%dms", *s.Latency)
		}
		line := fmt.Sprintf("  %-20s %-8s %7s", diagText(s.Name, 20), s.Status, lat)
		if s.Status != StatusUp {
			line += "  " + diagText(s.Detail, 60)
		}
		w("%s", line)
	}

	if len(in.counters.Errors) > 0 {
		w("failures by category (lifetime): %s", mapLine(in.counters.Errors))
	}
	w("history   %d state changes recently · %d blips (failures too short to open an incident) · %d checks recorded",
		len(in.counters.Changes), in.counters.Blips, in.counters.Checks)

	w("prober    cycle %s (avg %s, %d cycles) · a cycle near the %s timeout means a probe timed out",
		in.lastCycle.Round(time.Millisecond), in.avgCycle.Round(time.Millisecond), in.cycles, in.timeout)
	if in.proc != "" {
		w("%s", in.proc)
	}
	for _, l := range in.host {
		w("%s", l)
	}
	return capDiag(b.String())
}

// processLine reports the status process itself: a restart, a goroutine leak or
// a heap pinned against the container's memory limit all explain slow probes.
func (d *Diagnoser) processLine(now time.Time) string {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	rev := ""
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, s := range bi.Settings {
			if s.Key == "vcs.revision" && len(s.Value) >= 8 {
				rev = " · build " + s.Value[:8]
			}
		}
	}
	return fmt.Sprintf("process   up %s · %d goroutines · heap %s of %s sys · %d GCs (last pause %s) · GOMAXPROCS %d of %d CPUs · %s%s",
		HumanDuration(now.Sub(d.started)), runtime.NumGoroutine(), mib(m.HeapAlloc), mib(m.Sys), m.NumGC,
		time.Duration(m.PauseNs[(m.NumGC+255)%256]).Round(time.Microsecond), runtime.GOMAXPROCS(0), runtime.NumCPU(), runtime.Version(), rev)
}

// hostLines reads load, pressure and container limits. Every file is optional:
// a missing one (non-Linux, cgroup v1, a locked-down mount) just drops its line.
func (d *Diagnoser) hostLines(failSince, now time.Time) []string {
	var out []string

	if b, err := os.ReadFile(filepath.Join(d.procRoot, "loadavg")); err == nil {
		if f := strings.Fields(string(b)); len(f) >= 4 {
			out = append(out, fmt.Sprintf("host      load %s %s %s (1/5/15m) · runnable/total %s · %d CPUs", f[0], f[1], f[2], f[3], runtime.NumCPU()))
		}
	}

	// Pressure stall info: share of the last 10s/60s the host spent waiting on
	// CPU, disk or memory. Direct evidence for "the box was starved".
	var psi []string
	for _, r := range []string{"cpu", "io", "memory"} {
		if b, err := os.ReadFile(filepath.Join(d.procRoot, "pressure", r)); err == nil {
			if v := psiSome(string(b)); v != "" {
				psi = append(psi, r+" "+v)
			}
		}
	}
	if len(psi) > 0 {
		out = append(out, "pressure  stalled % (some, avg10/avg60): "+strings.Join(psi, " · "))
	}

	// This container's own CPU quota and memory against its limits.
	var cg []string
	if b, err := os.ReadFile(filepath.Join(d.cgroupRoot, "cpu.max")); err == nil {
		if f := strings.Fields(string(b)); len(f) == 2 && f[0] != "max" {
			q, e1 := strconv.ParseFloat(f[0], 64)
			p, e2 := strconv.ParseFloat(f[1], 64)
			if e1 == nil && e2 == nil && p > 0 {
				cg = append(cg, fmt.Sprintf("cpu quota %.2f", q/p))
			}
		}
	}
	if cur, err := readInt(filepath.Join(d.cgroupRoot, "memory.current")); err == nil {
		s := "memory " + mib(uint64(cur))
		if mx, err := readInt(filepath.Join(d.cgroupRoot, "memory.max")); err == nil && mx > 0 {
			s += " of " + mib(uint64(mx))
		}
		cg = append(cg, s)
	}
	if t := d.throttleSince(failSince, now); t != "" {
		cg = append(cg, t)
	}
	if len(cg) > 0 {
		out = append(out, "container "+strings.Join(cg, " · "))
	}
	return out
}

// throttleSince reports how much the status container's CPU was throttled
// since just before the failure began (or over the last few minutes when no
// failure is open), from the per-cycle samples.
func (d *Diagnoser) throttleSince(failSince, now time.Time) string {
	cur := readKV(filepath.Join(d.cgroupRoot, "cpu.stat"))
	if cur == nil {
		return ""
	}
	since := failSince.Add(-2 * time.Minute)
	if failSince.IsZero() {
		since = now.Add(-5 * time.Minute)
	}
	d.mu.Lock()
	var base *cgSample
	for i := range d.ring {
		if !d.ring[i].at.After(since) {
			base = &d.ring[i]
		}
	}
	if base == nil && len(d.ring) > 0 {
		base = &d.ring[0]
	}
	d.mu.Unlock()
	if base == nil {
		return fmt.Sprintf("throttled %d of %d periods since container start", cur["nr_throttled"], cur["nr_periods"])
	}
	return fmt.Sprintf("throttled %d of %d periods, %s of CPU time held back, over the last %s",
		cur["nr_throttled"]-base.throttled, cur["nr_periods"]-base.periods,
		(time.Duration(cur["throttled_usec"]-base.usec) * time.Microsecond).Round(time.Millisecond), HumanDuration(now.Sub(base.at)))
}

// ── sanitising and formatting helpers ───────────────────────────────────────

var (
	reURLHost = regexp.MustCompile(`https?://[^/\s"'` + "`" + `]+`)
	reIPv4    = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b`)
	reIPv6    = regexp.MustCompile(`\[[0-9a-fA-F:.]*:[0-9a-fA-F:.]*\](?::\d+)?`)
)

// diagText makes a free-text probe string safe to publish: no IP literals, no
// URL hosts, no control characters or backticks (which could close the code
// fence), bounded length.
func diagText(s string, max int) string {
	s = reURLHost.ReplaceAllString(s, "[host]")
	s = reIPv6.ReplaceAllString(s, "[ip]")
	s = reIPv4.ReplaceAllString(s, "[ip]")
	s = strings.Map(func(r rune) rune {
		switch {
		case r == '`':
			return '\''
		case r < 0x20 || r == 0x7f:
			return ' '
		}
		return r
	}, s)
	return truncate(strings.TrimSpace(s), max)
}

// targetLabel shows a target as host+path for a public https URL and as the
// path alone for anything else, so internal service names and ports never leak.
func targetLabel(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Path == "" && u.Host == "" {
		return "—"
	}
	path := u.Path
	if path == "" {
		path = "/"
	}
	if u.Scheme == "https" {
		return diagText(u.Hostname()+path, 80)
	}
	return "[internal]" + diagText(path, 60)
}

func connLabel(p *Phases) string {
	if p.Reused {
		return "reused connection"
	}
	return "new connection"
}

func codeLabel(c int) string {
	if c <= 0 {
		return "—"
	}
	return strconv.Itoa(c)
}

func joinOrNone(s []string) string {
	if len(s) == 0 {
		return "none"
	}
	return diagText(strings.Join(s, ", "), 120)
}

// ms prints a phase timing; -1 means the phase did not run or did not finish.
func ms(v float64) string {
	if v < 0 {
		return "—"
	}
	if v < 10 {
		return fmt.Sprintf("%.1fms", v)
	}
	return fmt.Sprintf("%.0fms", v)
}

func mib(b uint64) string { return fmt.Sprintf("%.0fMiB", float64(b)/(1<<20)) }

func mapLine(m map[string]int) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s %d", diagText(k, 24), m[k]))
	}
	return strings.Join(parts, " · ")
}

// capDiag trims at a line boundary so a long report loses its tail, not a
// half-written line.
func capDiag(s string) string {
	if len(s) <= diagMaxBytes {
		return s
	}
	cut := strings.LastIndexByte(s[:diagMaxBytes], '\n')
	if cut < 0 {
		cut = diagMaxBytes
	}
	return s[:cut] + "\n… (truncated)"
}

// readKV parses a "key value" per line file (cgroup cpu.stat).
func readKV(path string) map[string]int64 {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	out := map[string]int64{}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 {
			if n, err := strconv.ParseInt(f[1], 10, 64); err == nil {
				out[f[0]] = n
			}
		}
	}
	return out
}

func readInt(path string) (int64, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	return strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
}

// psiSome extracts "avg10/avg60" from the "some" line of a pressure file.
func psiSome(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if !strings.HasPrefix(line, "some ") {
			continue
		}
		var a10, a60 string
		for _, f := range strings.Fields(line) {
			switch {
			case strings.HasPrefix(f, "avg10="):
				a10 = strings.TrimPrefix(f, "avg10=")
			case strings.HasPrefix(f, "avg60="):
				a60 = strings.TrimPrefix(f, "avg60=")
			}
		}
		if a10 != "" && a60 != "" {
			return a10 + "/" + a60
		}
	}
	return ""
}
