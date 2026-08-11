package discordbot

import (
	"testing"
	"time"
)

// Wall-clock time cannot be added up. These are the cases where it was being
// added up, and the reported symptom that started this: nine hours "in games"
// out of an evening he had not been online nine hours for.

// TestGamingTimeIsUnionOfSimultaneousActivities is the reported bug.
//
// Discord stacks activities and this tracker records all of them, so a game
// beside an editor beside a launcher is three concurrent type-0 "Playing"
// sessions covering ONE stretch of evening.
func TestGamingTimeIsUnionOfSimultaneousActivities(t *testing.T) {
	loc := eastern(t)
	from, to, err := dayBounds("2026-08-11", loc)
	if err != nil {
		t.Fatalf("dayBounds: %v", err)
	}
	now := to

	// 18:00 → 23:00 local: five hours of wall clock, three overlapping rows.
	start := from.Add(18 * time.Hour)
	end := from.Add(23 * time.Hour)
	closed := func(name string, s, e time.Time) *presenceSession {
		e2 := e
		return &presenceSession{
			DiscordID: "u", ActivityName: name, ActivityType: 0,
			StartedAt: s, EndedAt: &e2,
		}
	}
	presence := []*presenceSession{
		closed("Counter-Strike 2", start, end),
		closed("Visual Studio Code", start.Add(30*time.Minute), end),
		closed("Riot Client", start, end.Add(-time.Hour)),
	}

	d := buildDayRollup("u", "2026-08-11", "America/New_York", loc, from, to, now,
		nil, nil, presence, nil, nil)

	const wantSec = 5 * 3600
	if d.GamingSec != wantSec {
		t.Errorf("GamingSec = %d (%.1fh), want %d (5h) — overlapping activities were summed",
			d.GamingSec, float64(d.GamingSec)/3600, wantSec)
	}
	// Sessions are counted, not measured: three were started.
	if d.GameSessions != 3 {
		t.Errorf("GameSessions = %d, want 3", d.GameSessions)
	}
	// A single title can never exceed the day's merged total.
	if d.TopGameSec > d.GamingSec {
		t.Errorf("TopGameSec %d exceeds GamingSec %d", d.TopGameSec, d.GamingSec)
	}
}

// TestGamingTimeCannotExceedTheDay is the invariant the page's headline depends
// on: whatever the log holds, a day cannot contain more than a day.
func TestGamingTimeCannotExceedTheDay(t *testing.T) {
	loc := eastern(t)
	from, to, err := dayBounds("2026-08-11", loc)
	if err != nil {
		t.Fatalf("dayBounds: %v", err)
	}

	// Twelve identical all-day sessions — the shape a restart loop produces.
	var presence []*presenceSession
	for i := 0; i < 12; i++ {
		presence = append(presence, &presenceSession{
			DiscordID: "u", ActivityName: "Counter-Strike 2", ActivityType: 0,
			StartedAt: from,
		})
	}
	d := buildDayRollup("u", "2026-08-11", "America/New_York", loc, from, to, to,
		nil, nil, presence, nil, nil)

	dayLen := int(to.Sub(from).Seconds())
	if d.GamingSec > dayLen {
		t.Errorf("GamingSec = %d, longer than the day itself (%d)", d.GamingSec, dayLen)
	}
}

// TestVoiceTimeIsUnionOfOverlappingSessions covers the same defect in the voice
// log, which the repo itself notes can transiently hold two open rows after a
// crash. The derived figures must agree with the merged total, not with a sum.
func TestVoiceTimeIsUnionOfOverlappingSessions(t *testing.T) {
	loc := eastern(t)
	from, to, err := dayBounds("2026-08-11", loc)
	if err != nil {
		t.Fatalf("dayBounds: %v", err)
	}

	start := from.Add(20 * time.Hour) // 20:00 local
	end := from.Add(23 * time.Hour)   // 23:00 local
	mid := from.Add(21 * time.Hour)
	closeAt := func(v time.Time) *time.Time { return &v }

	voice := []*voiceSession{
		{DiscordID: "u", JoinedAt: start, LeftAt: closeAt(end)},
		// The duplicate a crash leaves behind: same stretch, second row.
		{DiscordID: "u", JoinedAt: mid, LeftAt: closeAt(end)},
	}

	d := buildDayRollup("u", "2026-08-11", "America/New_York", loc, from, to, to,
		nil, voice, nil, nil, nil)

	if d.VoiceSec != 3*3600 {
		t.Errorf("VoiceSec = %d, want %d (3h of wall clock)", d.VoiceSec, 3*3600)
	}
	// The histogram is read off the same merged spans, so it must agree.
	hourly := 0
	for _, v := range d.HourlyVoiceSec {
		hourly += v
	}
	if hourly != d.VoiceSec {
		t.Errorf("hourly histogram sums to %d but VoiceSec is %d", hourly, d.VoiceSec)
	}
}

// TestStatusTimeIsUnionPerBucket pins the contract the page states in prose:
// online/idle/dnd are mutually exclusive and sum to presence, while the three
// client figures overlap each other. Merging must not change either half.
func TestStatusTimeIsUnionPerBucket(t *testing.T) {
	loc := eastern(t)
	from, to, err := dayBounds("2026-08-11", loc)
	if err != nil {
		t.Fatalf("dayBounds: %v", err)
	}

	at := func(h int) time.Time { return from.Add(time.Duration(h) * time.Hour) }
	closeAt := func(v time.Time) *time.Time { return &v }

	statuses := []*statusSession{
		// 12:00-16:00 online on desktop AND mobile at once.
		{DiscordID: "u", Status: "online", StartedAt: at(12), EndedAt: closeAt(at(16)),
			Clients: clientSet{Desktop: true, Mobile: true}},
		// A duplicate row covering part of the same stretch.
		{DiscordID: "u", Status: "online", StartedAt: at(14), EndedAt: closeAt(at(16)),
			Clients: clientSet{Desktop: true}},
		// 16:00-18:00 idle on mobile only.
		{DiscordID: "u", Status: "idle", StartedAt: at(16), EndedAt: closeAt(at(18)),
			Clients: clientSet{Mobile: true}},
	}

	d := buildDayRollup("u", "2026-08-11", "America/New_York", loc, from, to, to,
		nil, nil, nil, statuses, nil)

	if d.OnlineSec != 4*3600 {
		t.Errorf("OnlineSec = %d, want %d — the duplicate row was counted twice", d.OnlineSec, 4*3600)
	}
	if d.IdleSec != 2*3600 {
		t.Errorf("IdleSec = %d, want %d", d.IdleSec, 2*3600)
	}
	presence := d.OnlineSec + d.IdleSec + d.DndSec
	if presence != 6*3600 {
		t.Errorf("presence = %d, want %d", presence, 6*3600)
	}
	// Desktop 12-16 = 4h, mobile 12-16 plus 16-18 = 6h. They overlap, and that
	// is the documented contract — six plus four exceeds the six-hour presence.
	if d.DesktopSec != 4*3600 {
		t.Errorf("DesktopSec = %d, want %d", d.DesktopSec, 4*3600)
	}
	if d.MobileSec != 6*3600 {
		t.Errorf("MobileSec = %d, want %d", d.MobileSec, 6*3600)
	}
	if d.DesktopSec+d.MobileSec <= presence {
		t.Error("client totals no longer overlap — the per-bucket merge was applied across buckets")
	}
}

func TestMergeSpans(t *testing.T) {
	base := time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC)
	at := func(h int) time.Time { return base.Add(time.Duration(h) * time.Hour) }
	day := span{start: base, end: at(24)}

	cases := []struct {
		name  string
		in    []span
		wantS int // seconds in the union
		wantN int // number of merged stretches
	}{
		{"empty", nil, 0, 0},
		{"single", []span{{at(1), at(3)}}, 2 * 3600, 1},
		{"disjoint", []span{{at(1), at(3)}, {at(5), at(6)}}, 3 * 3600, 2},
		{"overlapping", []span{{at(1), at(4)}, {at(2), at(6)}}, 5 * 3600, 1},
		{"contained", []span{{at(1), at(9)}, {at(3), at(4)}}, 8 * 3600, 1},
		{"touching merges", []span{{at(1), at(3)}, {at(3), at(5)}}, 4 * 3600, 1},
		{"identical", []span{{at(1), at(5)}, {at(1), at(5)}, {at(1), at(5)}}, 4 * 3600, 1},
		// Order must not matter: rows arrive however the query sorted them.
		{"unsorted", []span{{at(8), at(9)}, {at(1), at(3)}, {at(2), at(4)}}, 4 * 3600, 2},
		// Zero-length and inverted spans are dropped rather than counted.
		{"degenerate", []span{{at(3), at(3)}, {at(5), at(2)}}, 0, 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			merged := mergeSpans(tc.in, day.start, day.end)
			if len(merged) != tc.wantN {
				t.Errorf("merged into %d stretches, want %d", len(merged), tc.wantN)
			}
			if got := unionSeconds(tc.in, day.start, day.end); got != tc.wantS {
				t.Errorf("unionSeconds = %d, want %d", got, tc.wantS)
			}
		})
	}
}

func TestUnionSecondsClipsToTheWindow(t *testing.T) {
	base := time.Date(2026, 8, 11, 0, 0, 0, 0, time.UTC)
	at := func(h int) time.Time { return base.Add(time.Duration(h) * time.Hour) }
	// A session running from yesterday into tomorrow contributes one day, not
	// three — this is what keeps a call across midnight split rather than
	// double-credited.
	got := unionSeconds([]span{{at(-6), at(30)}}, base, at(24))
	if got != 24*3600 {
		t.Errorf("unionSeconds = %d, want a full day (%d)", got, 24*3600)
	}
}
