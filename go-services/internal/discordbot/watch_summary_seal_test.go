package discordbot

import (
	"testing"
	"time"
)

// The seal: a concluded period is written at most once, and never rewritten.
//
// Worth testing directly rather than through a pass, because the failure is
// silent in both directions. Seal too eagerly and a day is frozen while its
// numbers are still moving, so the prose contradicts the figures beside it
// forever. Seal too late — or not at all — and every reaction that lands on an
// old message, plus every retention prune, quietly re-bills a day that was
// finished, rewriting history from thinner evidence than it was first written
// from.

func testLoc(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Skipf("tzdata unavailable: %v", err)
	}
	return loc
}

// TestDecideSummaryStatesTheRule is the rule itself, with no clock and no
// database in the way.
func TestDecideSummaryStatesTheRule(t *testing.T) {
	cases := []struct {
		name    string
		sealed  bool
		written bool
		want    summaryAction
	}{
		{"current period, never written", false, false, summaryRefresh},
		{"current period, already written", false, true, summaryRefresh},
		{"concluded, never written — a hole to fill", true, false, summaryBackfill},
		{"concluded and written — finished", true, true, summarySealed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := decideSummary(tc.sealed, tc.written); got != tc.want {
				t.Errorf("decideSummary(sealed=%v, written=%v) = %v, want %v",
					tc.sealed, tc.written, got, tc.want)
			}
		})
	}
}

func TestPeriodEndsAtIsLocalMidnightAfterTheLastDay(t *testing.T) {
	loc := testLoc(t)

	cases := []struct {
		period, key string
		want        string // the local instant the period stops accruing
	}{
		{periodDay, "2026-08-11", "2026-08-12T00:00:00"},
		// ISO week 33 of 2026 runs Mon 10 Aug to Sun 16 Aug.
		{periodWeek, "2026-W33", "2026-08-17T00:00:00"},
		{periodMonth, "2026-08", "2026-09-01T00:00:00"},
		// A 31-day month, and one that ends on a leap day, since the end is
		// derived rather than assumed.
		{periodMonth, "2026-01", "2026-02-01T00:00:00"},
		{periodMonth, "2028-02", "2028-03-01T00:00:00"},
	}
	for _, tc := range cases {
		t.Run(tc.period+" "+tc.key, func(t *testing.T) {
			got, err := periodEndsAt(tc.period, tc.key, loc)
			if err != nil {
				t.Fatalf("periodEndsAt: %v", err)
			}
			want, err := time.ParseInLocation("2006-01-02T15:04:05", tc.want, loc)
			if err != nil {
				t.Fatalf("bad want: %v", err)
			}
			if !got.Equal(want) {
				t.Errorf("periodEndsAt(%s, %s) = %s, want %s",
					tc.period, tc.key, got.In(loc), want)
			}
		})
	}
}

// TestPeriodSealedHoldsOpenUntilTheWindowElapses pins both boundaries.
//
// The window buys one thing: the pass that runs AFTER midnight, whose write-up
// is the one kept forever. Passes are half an hour apart, so the last one before
// midnight can be as early as 23:31 — sealing on the boundary would freeze every
// entry in the dossier with the end of the evening missing.
func TestPeriodSealedHoldsOpenUntilTheWindowElapses(t *testing.T) {
	loc := testLoc(t)
	at := func(s string) time.Time {
		ts, err := time.ParseInLocation("2006-01-02T15:04:05", s, loc)
		if err != nil {
			t.Fatalf("bad time %q: %v", s, err)
		}
		return ts
	}
	const day = "2026-08-11"
	// The default pass cadence: seals a day at 01:00 local.
	window := (&WatchSummarizer{}).settleWindow()

	cases := []struct {
		when string
		want bool
		why  string
	}{
		{"2026-08-11T09:00:00", false, "the day is in progress"},
		{"2026-08-11T23:59:59", false, "still the day itself"},
		{"2026-08-12T00:00:01", false, "midnight has passed, but the final pass has not run"},
		{"2026-08-12T00:30:00", false, "the final pass — this is the write-up that gets kept"},
		{"2026-08-12T01:00:00", true, "two pass intervals on: sealed"},
		{"2026-08-12T09:00:00", true, "well past it"},
		{"2026-09-01T00:00:00", true, "weeks later"},
	}
	for _, tc := range cases {
		t.Run(tc.when, func(t *testing.T) {
			got := periodSealed(periodDay, day, at(tc.when), loc, window)
			if got != tc.want {
				t.Errorf("periodSealed(%s at %s) = %v, want %v — %s",
					day, tc.when, got, tc.want, tc.why)
			}
		})
	}
}

func TestPeriodSealedCoversWeeksAndMonths(t *testing.T) {
	loc := testLoc(t)
	window := (&WatchSummarizer{}).settleWindow()
	at := func(s string) time.Time {
		ts, err := time.ParseInLocation("2006-01-02T15:04:05", s, loc)
		if err != nil {
			t.Fatalf("bad time %q: %v", s, err)
		}
		return ts
	}

	// Week 33 ends Sunday 16 Aug, so it seals at 01:00 on Monday 17 Aug.
	if periodSealed(periodWeek, "2026-W33", at("2026-08-17T00:59:00"), loc, window) {
		t.Error("a week sealed before its settle window elapsed")
	}
	if !periodSealed(periodWeek, "2026-W33", at("2026-08-17T01:00:00"), loc, window) {
		t.Error("a week did not seal once its settle window elapsed")
	}
	// And the week containing "now" must never be sealed — that is what stops
	// the digest posting a draft.
	if periodSealed(periodWeek, "2026-W33", at("2026-08-13T12:00:00"), loc, window) {
		t.Error("the current week read as sealed")
	}

	if periodSealed(periodMonth, "2026-08", at("2026-09-01T00:59:00"), loc, window) {
		t.Error("a month sealed before its settle window elapsed")
	}
	if !periodSealed(periodMonth, "2026-08", at("2026-09-01T01:00:00"), loc, window) {
		t.Error("a month did not seal once its settle window elapsed")
	}
}

// TestSettleWindowLeavesRoomForOneMorePass is the invariant the whole seal rests
// on: the window must outlast a pass interval, or the final pass never lands and
// each day is sealed on a write-up that stops before midnight. Tying the two
// together means changing the cadence cannot silently break that.
func TestSettleWindowLeavesRoomForOneMorePass(t *testing.T) {
	for _, interval := range []time.Duration{
		time.Minute, 15 * time.Minute, defaultSummaryInterval, 2 * time.Hour,
	} {
		s := &WatchSummarizer{passInterval: interval}
		if got := s.settleWindow(); got <= interval {
			t.Errorf("settleWindow() = %s for a %s pass — no pass can land after the "+
				"period ends, so the final write-up is lost", got, interval)
		}
	}
	// A summarizer built without Start (or with a nonsense cadence) must still
	// seal on the documented default rather than instantly, at zero.
	for _, interval := range []time.Duration{0, -time.Hour} {
		s := &WatchSummarizer{passInterval: interval}
		if got := s.settleWindow(); got != 2*defaultSummaryInterval {
			t.Errorf("settleWindow() = %s for interval %s, want the default %s",
				got, interval, 2*defaultSummaryInterval)
		}
	}
}

// TestPeriodSealedFailsOpenOnANonsenseKey pins the direction of the failure.
// Reading an unplaceable key as sealed would mean a period that can never be
// written at all — a permanent blank the logs would not explain.
func TestPeriodSealedFailsOpenOnANonsenseKey(t *testing.T) {
	loc := testLoc(t)
	now := time.Date(2030, time.January, 1, 12, 0, 0, 0, loc)

	for _, key := range []string{"", "not-a-date", "2026-13-45", "2026-W99"} {
		if periodSealed(periodDay, key, now, loc, time.Hour) {
			t.Errorf("periodSealed(day, %q) = true, want false", key)
		}
	}
	if periodSealed("fortnight", "2026-08-11", now, loc, time.Hour) {
		t.Error("an unknown period read as sealed")
	}
}
