package status

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// Charts, as inline SVG computed on the server. No charting library, no
// canvas, no script: the page must render whole when nothing but this process
// is reachable, and an SVG is also what a screen reader, a print stylesheet and
// a text-mode browser can all do something sensible with. Every colour comes
// from a CSS class keyed to the page's tokens.

// renderSparkline draws the last n latencies as a polyline, with failures as
// ticks along the floor so a gap in the line reads as "this failed", not "this
// was fast".
func renderSparkline(samples []Sample, n int) string {
	if len(samples) > n {
		samples = samples[len(samples)-n:]
	}
	if len(samples) < 2 {
		return `<svg class="spark" viewBox="0 0 80 24" aria-hidden="true"></svg>`
	}
	var maxL int64 = 1
	for _, s := range samples {
		if s.L != nil && *s.L > maxL {
			maxL = *s.L
		}
	}
	const w, h = 80.0, 24.0
	step := w / float64(len(samples)-1)
	var pts, fails strings.Builder
	var segs []string
	for i, s := range samples {
		x := float64(i) * step
		if s.L == nil {
			if pts.Len() > 0 {
				segs = append(segs, pts.String())
				pts.Reset()
			}
			if s.S != StatusUp {
				fmt.Fprintf(&fails, `<line class="spark__fail" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>`, x, h-4, x, h)
			}
			continue
		}
		y := h - 2 - (float64(*s.L)/float64(maxL))*(h-6)
		fmt.Fprintf(&pts, "%.1f,%.1f ", x, y)
		if s.S != StatusUp {
			fmt.Fprintf(&fails, `<line class="spark__fail" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>`, x, h-4, x, h)
		}
	}
	if pts.Len() > 0 {
		segs = append(segs, pts.String())
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, `<svg class="spark" viewBox="0 0 %.0f %.0f" preserveAspectRatio="none" role="img" aria-label="Latency over the last %d checks, peak %d ms">`, w, h, len(samples), maxL)
	for _, seg := range segs {
		fmt.Fprintf(&sb, `<polyline class="spark__line" points="%s"/>`, strings.TrimSpace(seg))
	}
	sb.WriteString(fails.String())
	sb.WriteString(`</svg>`)
	return sb.String()
}

// renderLatencyChart draws hourly mean and p95 latency over the last `slots`
// buckets, with the target's latency budget as a reference line.
func renderLatencyChart(hourly []Bucket, step time.Duration, now time.Time, slots int, budgetMs int64) string {
	stepMs := step.Milliseconds()
	if stepMs <= 0 {
		return ""
	}
	by := map[int64]Bucket{}
	for _, b := range hourly {
		k := floorTo(b.T, stepMs)
		cur := by[k]
		cur.T = k
		cur.merge(b)
		by[k] = cur
	}
	current := floorTo(now.UnixMilli(), stepMs)
	type pt struct{ avg, p95 float64 }
	pts := make([]*pt, slots)
	maxV := 1.0
	any := false
	for i := 0; i < slots; i++ {
		t := current - int64(slots-1-i)*stepMs
		b, ok := by[t]
		if !ok || b.LatN == 0 {
			continue
		}
		p := &pt{avg: float64(b.LatSum) / float64(b.LatN), p95: histQuantile(b, 0.95)}
		pts[i] = p
		maxV = math.Max(maxV, math.Max(p.avg, p.p95))
		any = true
	}
	if !any {
		return `<p class="dim">Not enough latency history for a chart yet.</p>`
	}
	if budgetMs > 0 && float64(budgetMs) < maxV*1.6 {
		maxV = math.Max(maxV, float64(budgetMs))
	}
	maxV = niceCeil(maxV * 1.1)

	const w, h, padL, padB, padT = 600.0, 150.0, 44.0, 18.0, 8.0
	plotW, plotH := w-padL-4, h-padB-padT
	x := func(i int) float64 { return padL + float64(i)/float64(slots-1)*plotW }
	y := func(v float64) float64 { return padT + plotH - v/maxV*plotH }

	line := func(get func(*pt) float64) string {
		var out []string
		var cur strings.Builder
		for i, p := range pts {
			if p == nil {
				if cur.Len() > 0 {
					out = append(out, cur.String())
					cur.Reset()
				}
				continue
			}
			fmt.Fprintf(&cur, "%.1f,%.1f ", x(i), y(get(p)))
		}
		if cur.Len() > 0 {
			out = append(out, cur.String())
		}
		return strings.Join(out, "|")
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, `<figure class="chart"><svg viewBox="0 0 %.0f %.0f" role="img" aria-label="Hourly mean and p95 latency over the last %d hours">`, w, h, slots)
	// Grid + axis labels.
	for _, f := range []float64{0, 0.5, 1} {
		v := maxV * f
		fmt.Fprintf(&sb, `<line class="chart__grid" x1="%.1f" x2="%.1f" y1="%.1f" y2="%.1f"/><text class="chart__axis" x="%.1f" y="%.1f">%s</text>`,
			padL, w-4, y(v), y(v), padL-6, y(v)+3, shortMs(v))
	}
	if budgetMs > 0 && float64(budgetMs) <= maxV {
		fmt.Fprintf(&sb, `<line class="chart__budget" x1="%.1f" x2="%.1f" y1="%.1f" y2="%.1f"/><text class="chart__axis chart__axis--budget" x="%.1f" y="%.1f">budget</text>`,
			padL, w-4, y(float64(budgetMs)), y(float64(budgetMs)), w-6, y(float64(budgetMs))-4)
	}
	for _, seg := range strings.Split(line(func(p *pt) float64 { return p.p95 }), "|") {
		if seg != "" {
			fmt.Fprintf(&sb, `<polyline class="chart__p95" points="%s"/>`, strings.TrimSpace(seg))
		}
	}
	for _, seg := range strings.Split(line(func(p *pt) float64 { return p.avg }), "|") {
		if seg != "" {
			fmt.Fprintf(&sb, `<polyline class="chart__avg" points="%s"/>`, strings.TrimSpace(seg))
		}
	}
	fmt.Fprintf(&sb, `<text class="chart__axis" x="%.1f" y="%.1f" text-anchor="start">%dh ago</text><text class="chart__axis" x="%.1f" y="%.1f">now</text>`,
		padL, h-4, slots, w-4, h-4)
	sb.WriteString(`</svg><figcaption><span class="key key--avg"></span>mean <span class="key key--p95"></span>p95 (estimated)</figcaption></figure>`)
	return sb.String()
}

func niceCeil(v float64) float64 {
	if v <= 0 {
		return 1
	}
	mag := math.Pow(10, math.Floor(math.Log10(v)))
	for _, m := range []float64{1, 2, 2.5, 5, 10} {
		if m*mag >= v {
			return m * mag
		}
	}
	return 10 * mag
}

func shortMs(v float64) string {
	if v >= 1000 {
		return fmt.Sprintf("%.1fs", v/1000)
	}
	return fmt.Sprintf("%.0fms", v)
}

// renderHistogram draws the 24h latency distribution across histogram bins.
func renderHistogram(hourly []Bucket, step time.Duration, now time.Time) string {
	b, _ := sumWindow(hourly, step, now, 24*time.Hour)
	if b.LatN == 0 {
		return ""
	}
	top := 0
	last := 0
	for i, n := range b.LatHist {
		if n > top {
			top = n
		}
		if n > 0 {
			last = i
		}
	}
	var sb strings.Builder
	sb.WriteString(`<p class="dist__title">Latency distribution · 24h</p><ol class="histo" role="img" aria-label="Latency distribution over 24 hours">`)
	for i := 0; i <= last && i < len(b.LatHist); i++ {
		label := "> " + shortMs(float64(latencyBounds[len(latencyBounds)-1]))
		if i < len(latencyBounds) {
			label = "≤ " + shortMs(float64(latencyBounds[i]))
		}
		n := b.LatHist[i]
		pct := float64(n) / float64(b.LatN) * 100
		fmt.Fprintf(&sb, `<li title="%s: %d checks (%.1f%%)"><span class="histo__bar" style="height:%.1f%%"></span><span class="histo__label">%s</span></li>`,
			esc(label), n, pct, float64(n)/float64(top)*100, esc(label))
	}
	sb.WriteString(`</ol>`)
	return sb.String()
}

// renderPhases draws the last request's timing as a stacked bar: DNS,
// connect, TLS, server wait (TTFB minus the setup before it) and transfer.
func renderPhases(p *Phases) string {
	if p == nil || p.Total <= 0 {
		return ""
	}
	pos := func(v float64) float64 { return math.Max(0, v) }
	setup := pos(p.DNS) + pos(p.Connect) + pos(p.TLS)
	wait := pos(p.TTFB - setup)
	transfer := pos(p.Total - p.TTFB)
	if p.TTFB < 0 {
		wait, transfer = 0, 0
	}
	segs := []struct {
		k, label string
		v        float64
	}{
		{"dns", "DNS", pos(p.DNS)}, {"connect", "Connect", pos(p.Connect)}, {"tls", "TLS", pos(p.TLS)},
		{"wait", "Server", wait}, {"transfer", "Transfer", transfer},
	}
	sum := 0.0
	for _, s := range segs {
		sum += s.v
	}
	if sum <= 0 {
		return ""
	}
	var bar, legend strings.Builder
	for _, s := range segs {
		if s.v <= 0 {
			continue
		}
		pct := s.v / sum * 100
		fmt.Fprintf(&bar, `<span class="phase" data-k="%s" style="width:%.2f%%" title="%s: %.1f ms"></span>`, s.k, pct, s.label, s.v)
		fmt.Fprintf(&legend, `<li><span class="phase__key" data-k="%s"></span>%s <b>%.1f ms</b></li>`, s.k, s.label, s.v)
	}
	note := ""
	if p.Reused {
		note = `<p class="dim">Connection reused — no DNS, connect or TLS on this request.</p>`
	}
	return fmt.Sprintf(`<p class="dist__title">Timing · %.1f ms total</p><div class="phases" role="img" aria-label="Request timing breakdown">%s</div><ul class="dist__legend">%s</ul>%s`,
		p.Total, bar.String(), legend.String(), note)
}

// renderCalendar draws the platform's 90-day record as a week grid.
func renderCalendar(v *View) string {
	days := v.KPIs.Daily
	if len(days) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="calendar" aria-labelledby="cal-h"><h2 class="tier__label" id="cal-h">Platform uptime calendar</h2>`)
	fmt.Fprintf(&sb, `<p class="tier__note">Every service, every check, one square per UTC day for the last %d days.</p><div class="cal glass-fill"><ol class="cal__grid">`, len(days))
	// Pad the first column so weekdays line up (Monday first).
	first := time.UnixMilli(days[0].T).UTC()
	pad := (int(first.Weekday()) + 6) % 7
	for i := 0; i < pad; i++ {
		sb.WriteString(`<li class="cal__day" data-b="pad" aria-hidden="true"></li>`)
	}
	for _, d := range days {
		b := Bucket{Up: d.Checks - d.Failed, Down: d.Down, Degraded: d.Failed - d.Down}
		sev := BarSeverity(b)
		tip := time.UnixMilli(d.T).UTC().Format("Mon 2 Jan 2006")
		if d.Checks > 0 {
			tip += fmt.Sprintf(" — %s uptime · %d of %d checks failed", fmtPct(d.UptimePct), d.Failed, d.Checks)
		} else {
			tip += " — no data"
		}
		if d.Incidents > 0 {
			tip += fmt.Sprintf(" · %d incident(s)", d.Incidents)
		}
		inc := ""
		if d.Incidents > 0 {
			inc = ` data-inc="1"`
		}
		fmt.Fprintf(&sb, `<li class="cal__day" data-b="%s"%s title="%s"></li>`, sev, inc, esc(tip))
	}
	sb.WriteString(`</ol><ul class="legend"><li><span class="legend__sw" data-b="up"></span>No issues</li><li><span class="legend__sw" data-b="blip"></span>Brief blip (&lt;2% failed)</li><li><span class="legend__sw" data-b="degraded"></span>Partial disruption</li><li><span class="legend__sw" data-b="down"></span>Major outage (≥10% down)</li><li><span class="legend__sw" data-b="empty"></span>No data</li></ul></div></section>`)
	return sb.String()
}

// renderHeatmap draws every service's hourly mean latency over the last 24
// hours, shaded against that service's own budget so a 300ms page and a 3ms
// hub are each judged by their own standard.
func renderHeatmap(v *View) string {
	const slots = 24
	stepMs := v.BucketDur.Milliseconds()
	if stepMs <= 0 || len(v.Services) == 0 {
		return ""
	}
	current := floorTo(v.GeneratedAt.UnixMilli(), stepMs)
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="heatmap" aria-labelledby="hm-h"><h2 class="tier__label" id="hm-h">Latency heatmap · 24h</h2><p class="tier__note">Hourly mean response time, shaded against each service's own latency budget.</p><div class="hm glass-fill"><table class="hm__table"><thead><tr><th scope="col"><span class="sr-only">Service</span></th>`)
	for i := slots - 1; i >= 0; i-- {
		t := time.UnixMilli(current - int64(i)*stepMs).UTC()
		label := ""
		if i%6 == 0 {
			label = t.Format("15h")
		}
		fmt.Fprintf(&sb, `<th scope="col">%s</th>`, label)
	}
	sb.WriteString(`</tr></thead><tbody>`)
	for _, s := range v.Services {
		by := map[int64]Bucket{}
		for _, b := range s.Hourly {
			k := floorTo(b.T, stepMs)
			cur := by[k]
			cur.merge(b)
			by[k] = cur
		}
		ref := float64(s.BudgetMs)
		if ref <= 0 {
			ref = float64(s.ApdexTMs * 4)
		}
		fmt.Fprintf(&sb, `<tr><th scope="row"><a href="#svc-%s">%s</a></th>`, esc(s.Slug), esc(s.Name))
		for i := slots - 1; i >= 0; i-- {
			t := current - int64(i)*stepMs
			b, ok := by[t]
			if !ok || b.LatN == 0 {
				sb.WriteString(`<td data-l="none"></td>`)
				continue
			}
			avg := float64(b.LatSum) / float64(b.LatN)
			lvl := 0
			switch r := avg / ref; {
			case r >= 1:
				lvl = 4
			case r >= 0.6:
				lvl = 3
			case r >= 0.3:
				lvl = 2
			case r >= 0.1:
				lvl = 1
			}
			fmt.Fprintf(&sb, `<td data-l="%d" title="%s — %s avg"></td>`, lvl, esc(s.Name+" · "+time.UnixMilli(t).UTC().Format("15:04 UTC")), fmtMs(&avg))
		}
		sb.WriteString(`</tr>`)
	}
	sb.WriteString(`</tbody></table></div></section>`)
	return sb.String()
}

// renderLeaderboard ranks services by their last hour's mean latency.
func renderLeaderboard(v *View) string {
	type row struct {
		name, slug string
		avg, p95   float64
		budget     int64
	}
	var rows []row
	top := 1.0
	for _, s := range v.Services {
		if s.Latency1h.Avg == nil {
			continue
		}
		r := row{s.Name, s.Slug, *s.Latency1h.Avg, 0, s.BudgetMs}
		if s.Latency1h.P95 != nil {
			r.p95 = *s.Latency1h.P95
		}
		rows = append(rows, r)
		top = math.Max(top, math.Max(r.avg, r.p95))
	}
	if len(rows) == 0 {
		return ""
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].avg < rows[j].avg })
	var sb strings.Builder
	sb.WriteString(`<section class="tier" id="leaderboard" aria-labelledby="lb-h"><h2 class="tier__label" id="lb-h">Response time · last hour</h2><ol class="lb glass-fill">`)
	for i, r := range rows {
		fmt.Fprintf(&sb, `<li><span class="lb__rank">%d</span><a class="lb__name" href="#svc-%s">%s</a><span class="lb__track"><span class="lb__p95" style="width:%.1f%%"></span><span class="lb__avg" style="width:%.1f%%"></span></span><span class="lb__v">%s <span class="dim">p95 %s</span></span></li>`,
			i+1, esc(r.slug), esc(r.name), r.p95/top*100, r.avg/top*100, fmtMs(&r.avg), fmtMs(&r.p95))
	}
	sb.WriteString(`</ol></section>`)
	return sb.String()
}
