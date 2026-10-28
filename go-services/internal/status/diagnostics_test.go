package status

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
	out := renderDiag(sampleInput(time.Date(2026, 10, 28, 18, 3, 49, 0, time.UTC)))
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
	if out := renderDiag(in); len(out) > diagMaxBytes+40 || !strings.HasSuffix(out, "(truncated)") {
		t.Errorf("report not capped: %d bytes", len(out))
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
	rep := d.Report("Content feed", time.Now())
	if !strings.Contains(rep, "── diagnostics") || !strings.Contains(rep, "Content feed") {
		t.Fatalf("report = %q", rep)
	}
	if d.Report("No such service", time.Now()) != "" {
		t.Error("unknown service must yield no block")
	}
	var nilDiag *Diagnoser
	if nilDiag.Report("x", time.Now()) != "" {
		t.Error("nil diagnoser must yield no block")
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
