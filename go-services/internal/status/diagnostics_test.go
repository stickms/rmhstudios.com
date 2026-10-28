package status

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/oncall"
)

func i64(v int64) *int64 { return &v }

func sampleInput(now time.Time) diagInput {
	return diagInput{
		now: now, service: "Content feed", group: "Content",
		targetURL: "https://rmhstudios.com/blog/rss.xml?token=abc123",
		interval:  15 * time.Second, timeout: 4 * time.Second,
		failSince: now.Add(-50 * time.Second), consec: 4,
		recent: []Sample{
			{T: now.Add(-60 * time.Second).UnixMilli(), S: StatusUp, L: i64(210)},
			{T: now.Add(-45 * time.Second).UnixMilli(), S: StatusDown, E: CatStall, D: "timeout after 4000ms (stalled in TLS handshake)"},
		},
		counters: Counters{Errors: map[string]int{CatStall: 3, CatTimeout: 1}, Blips: 2, Checks: 900, Changes: []int64{1, 2}},
		detail:   ProbeDetail{Category: CatStall, Phases: &Phases{DNS: 3, Connect: 1.2, TLS: -1, TTFB: -1, Total: 4000, Family: "ipv6", Attempts: 2, Addrs: 2}},
		all: []diagService{
			{Name: "Website", Status: StatusDown, Category: CatStall, Detail: "timeout after 4000ms (stalled in TLS handshake)"},
			{Name: "Content feed", Status: StatusDown, Category: CatStall, Detail: "timeout after 4000ms (stalled in TLS handshake)"},
			{Name: "Socket", Status: StatusUp, Latency: i64(12)},
		},
		cycles: 100, lastCycle: 4100 * time.Millisecond, avgCycle: 300 * time.Millisecond,
	}
}

// The report has to answer the diagnosis questions: which phase, did anything
// else fail with it, and how was the prober and host doing.
func TestRenderDiagCarriesTheEvidence(t *testing.T) {
	out := renderDiag(sampleInput(time.Date(2026, 10, 28, 18, 3, 49, 0, time.UTC)), true)
	for _, want := range []string{
		"18:03:49 UTC",
		"rmhstudios.com/blog/rss.xml",
		"failing  4 checks since 18:02:59 UTC",
		"tls —",
		"first connect ipv6 · 2 connect attempt(s) · DNS returned 2 address(es)",
		"stalled in TLS handshake",
		"2 of 3 not up: Website, Content feed",
		"failures by category (lifetime): connect_stall 3 · timeout 1",
		"a cycle near the 4s timeout",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("report missing %q\n%s", want, out)
		}
	}
	if strings.Contains(out, "token=abc123") || strings.Contains(out, "?") {
		t.Errorf("query string leaked into the report:\n%s", out)
	}
}

// Nothing that could help an attacker may reach the channel: no addresses, no
// internal hosts, no way out of the code fence.
func TestDiagTextRedactsAndBounds(t *testing.T) {
	raw := "Get \"http://socket:7001/health\": dial tcp 172.18.0.5:7001: connect: refused; " +
		"dial tcp [2606:4700::1111]:443: i/o timeout; lookup x on 127.0.0.11:53 ```@everyone``` \x00\x1b[31m"
	got := diagText(raw, 400)
	for _, bad := range []string{"172.18.0.5", "2606:4700", "127.0.0.11", "socket:7001", "```", "\x00", "\x1b"} {
		if strings.Contains(got, bad) {
			t.Errorf("diagText kept %q: %s", bad, got)
		}
	}
	if !strings.Contains(got, "[ip]") || !strings.Contains(got, "[host]") {
		t.Errorf("expected placeholders in %q", got)
	}
	if n := len([]rune(diagText(strings.Repeat("a", 500), 70))); n > 71 {
		t.Errorf("not bounded: %d runes", n)
	}
}

func TestTargetLabelHidesInternalHosts(t *testing.T) {
	if got := targetLabel("http://supervisor:9090/health"); strings.Contains(got, "supervisor") || strings.Contains(got, "9090") {
		t.Errorf("internal host leaked: %q", got)
	}
	if got := targetLabel("https://rmhstudios.com/sitemap.xml"); got != "rmhstudios.com/sitemap.xml" {
		t.Errorf("public target label = %q", got)
	}
}

func TestRenderDiagIsCapped(t *testing.T) {
	in := sampleInput(time.Now())
	for i := 0; i < 80; i++ {
		in.all = append(in.all, diagService{Name: strings.Repeat("svc", 6), Status: StatusDown, Detail: strings.Repeat("x", 200)})
	}
	// The compact form holds no per-service table, so it stays small however
	// many services fail; it must never exceed its cap.
	if out := renderDiag(in, false); len(out) > diagCompactBytes+40 {
		t.Errorf("compact report over its cap: %d bytes", len(out))
	}
	for i := 0; i < 600; i++ {
		in.all = append(in.all, diagService{Name: "svc", Status: StatusDown, Detail: strings.Repeat("x", 200), Phases: &Phases{}})
	}
	if out := renderDiag(in, true); len(out) > diagFullBytes+40 || !strings.HasSuffix(out, "(truncated)") {
		t.Errorf("full report not capped: %d bytes", len(out))
	}
}

// Host numbers come from /proc and cgroup files; fake roots prove the parsing
// and that a missing file just drops its line.
func TestHostLinesReadProcAndCgroup(t *testing.T) {
	root := t.TempDir()
	write := func(rel, body string) {
		t.Helper()
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("proc/loadavg", "3.10 2.20 1.05 4/512 999\n")
	write("proc/pressure/cpu", "some avg10=12.50 avg60=4.00 avg300=1.00 total=1\n")
	write("proc/pressure/io", "some avg10=0.00 avg60=0.00 avg300=0.00 total=0\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n")
	write("cg/cpu.max", "50000 100000\n")
	write("cg/memory.current", "52428800\n")
	write("cg/memory.max", "134217728\n")
	write("cg/cpu.stat", "nr_periods 1000\nnr_throttled 40\nthrottled_usec 2500000\n")

	d := &Diagnoser{procRoot: filepath.Join(root, "proc"), cgroupRoot: filepath.Join(root, "cg")}
	now := time.Now()
	d.ring = []cgSample{{at: now.Add(-3 * time.Minute), periods: 900, throttled: 10, usec: 500000}}
	got := strings.Join(d.hostLines(now.Add(-time.Minute), now), "\n")
	for _, want := range []string{
		"load 3.10 2.20 1.05", "runnable/total 4/512",
		"cpu 12.50/4.00", "io 0.00/0.00",
		"cpu quota 0.50", "memory 50MiB of 128MiB",
		"throttled 30 of 100 periods, 2s of CPU time held back",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("host lines missing %q\n%s", want, got)
		}
	}
	if strings.Contains(got, "memory 0") {
		t.Errorf("pressure memory file is absent and must be skipped:\n%s", got)
	}
	empty := &Diagnoser{procRoot: filepath.Join(root, "none"), cgroupRoot: filepath.Join(root, "none")}
	if l := empty.hostLines(time.Time{}, now); len(l) != 0 {
		t.Errorf("missing files should produce no lines, got %v", l)
	}
}

// The Diagnoser reads a live Prober, and an alarm carries the fenced block.
func TestDiagnoserReportAndFence(t *testing.T) {
	p := NewProber([]Target{{Name: "Content feed", Group: "Content", URL: "https://rmhstudios.com/blog/rss.xml"}})
	d := NewDiagnoser(p, time.Now())
	d.procRoot, d.cgroupRoot = t.TempDir(), t.TempDir()
	compact, full := d.Reports("Content feed", time.Now())
	if !strings.Contains(compact, "── diagnostics") || !strings.Contains(full, "Content feed") {
		t.Fatalf("compact = %q full = %q", compact, full)
	}
	if c, f := d.Reports("No such service", time.Now()); c != "" || f != "" {
		t.Error("unknown service must yield no report")
	}
	var nilDiag *Diagnoser
	if c, f := nilDiag.Reports("x", time.Now()); c != "" || f != "" {
		t.Error("nil diagnoser must yield no report")
	}
}

func TestWithDiagnosticsFencesTheBlock(t *testing.T) {
	got := withDiagnostics("Content feed down.\nhttps://status.example/incidents/x", "── diagnostics ──\nline")
	if !strings.Contains(got, "\n```\n── diagnostics ──\nline\n```") || !strings.HasPrefix(got, "Content feed down.") {
		t.Errorf("unexpected detail: %q", got)
	}
	if withDiagnostics("plain", "") != "plain" {
		t.Error("an empty block must leave the detail untouched")
	}
}

// The compact summary keeps the discriminating facts; the table, the trend and
// the per-service timings belong to the file.
func TestCompactReportIsASummary(t *testing.T) {
	in := sampleInput(time.Date(2026, 10, 28, 18, 3, 49, 0, time.UTC))
	in.all[0].Phases = &Phases{DNS: 2, Connect: 1, TLS: -1, TTFB: -1, Total: 4000}
	compact, full := renderDiag(in, false), renderDiag(in, true)
	for _, want := range []string{"failing  4 checks", "last req", "2 of 3 not up: Website, Content feed", "prober"} {
		if !strings.Contains(compact, want) {
			t.Errorf("compact missing %q\n%s", want, compact)
		}
	}
	for _, only := range []string{"recent checks", "last probe:", "failures by category", "state changes"} {
		if strings.Contains(compact, only) {
			t.Errorf("compact must not carry %q\n%s", only, compact)
		}
		if !strings.Contains(full, only) {
			t.Errorf("full missing %q\n%s", only, full)
		}
	}
	if len(compact) > diagCompactBytes+40 {
		t.Errorf("compact is %d bytes", len(compact))
	}
}

// A resolve carries its evidence in the file only: the watchdog echoes a
// resolve's detail into a reply capped at 2000 characters.
func TestWithEvidenceKeepsResolveDetailShort(t *testing.T) {
	job := oncallJob{
		n:       Notification{Incident: &Incident{Components: []string{"Content feed"}}},
		compact: "summary", full: "the whole report",
	}
	firing := withEvidence(oncall.Alert{State: "firing", Detail: "down"}, job)
	if !strings.Contains(firing.Detail, "```\nsummary\n```") || firing.Attachment == nil || firing.Attachment.Content != "the whole report" {
		t.Errorf("firing alarm = %+v", firing)
	}
	resolved := withEvidence(oncall.Alert{State: "resolved", Detail: "recovered"}, job)
	if resolved.Detail != "recovered" {
		t.Errorf("resolve detail must stay as it was, got %q", resolved.Detail)
	}
	if resolved.Attachment == nil {
		t.Error("resolve must still carry the file")
	}
}

// The watchdog only accepts names of this shape; a rejected alarm would be lost.
func TestAttachmentNameMatchesWatchdogRule(t *testing.T) {
	re := regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.txt$`)
	for _, svc := range []string{"Content feed", "App readiness", "RMHbox", "", "Ünï cødé / ../x", strings.Repeat("long", 40)} {
		if n := attachmentName(svc, time.Now()); !re.MatchString(n) {
			t.Errorf("attachmentName(%q) = %q", svc, n)
		}
	}
}
