package discordbot

import (
	"testing"
	"time"
)

// A compose session counts on the day it STARTED and only once it has settled.
// The unsettled case is the one worth pinning: an open run is not a message he
// abandoned, it is one he may still be writing, and counting it would report an
// abandonment every time somebody is mid-sentence at the flush tick.
func TestBuildDayRollupTyping(t *testing.T) {
	loc := eastern(t)
	from, to, err := dayBounds("2026-08-11", loc)
	if err != nil {
		t.Fatalf("dayBounds: %v", err)
	}
	now := from.Add(20 * time.Hour)

	settled := func(at time.Time, dur int, sent bool) *typingSession {
		end := at.Add(time.Duration(dur) * time.Second)
		return &typingSession{
			DiscordID:    "u",
			ChannelID:    "c",
			StartedAt:    at,
			LastTypingAt: end,
			SettledAt:    &end,
			DurationSec:  dur,
			Sent:         sent,
		}
	}

	typing := []*typingSession{
		settled(from.Add(2*time.Hour), 40, false),
		settled(from.Add(3*time.Hour), 95, false),
		settled(from.Add(4*time.Hour), 12, true),
		// Still open — no verdict yet, so it contributes nothing at all.
		{DiscordID: "u", ChannelID: "c", StartedAt: from.Add(5 * time.Hour), LastTypingAt: now},
		// Yesterday's run, which this day's query would not return but which
		// must be ignored even if it did.
		settled(from.Add(-3*time.Hour), 60, false),
	}

	d := buildDayRollup("u", "2026-08-11", "America/New_York", loc, from, to, now,
		nil, nil, nil, nil, typing)

	if d.TypingStarts != 3 {
		t.Errorf("TypingStarts = %d, want 3", d.TypingStarts)
	}
	if d.TypingAbandoned != 2 {
		t.Errorf("TypingAbandoned = %d, want 2", d.TypingAbandoned)
	}
	if d.TypingAbandonedSec != 135 {
		t.Errorf("TypingAbandonedSec = %d, want 135", d.TypingAbandonedSec)
	}
}

// Job mentions roll up from the message flag, not from the text — the text is
// gone after retention and the count has to keep working without it.
func TestBuildDayRollupJobMentions(t *testing.T) {
	loc := eastern(t)
	from, to, err := dayBounds("2026-08-11", loc)
	if err != nil {
		t.Fatalf("dayBounds: %v", err)
	}
	now := from.Add(20 * time.Hour)

	messages := []*watchMessage{
		{DiscordID: "u", ChannelID: "c", SentAt: from.Add(time.Hour), MentionsJob: true},
		{DiscordID: "u", ChannelID: "c", SentAt: from.Add(2 * time.Hour)},
		{DiscordID: "u", ChannelID: "c", SentAt: from.Add(3 * time.Hour), MentionsJob: true},
	}

	d := buildDayRollup("u", "2026-08-11", "America/New_York", loc, from, to, now,
		messages, nil, nil, nil, nil)

	if d.Messages != 3 {
		t.Errorf("Messages = %d, want 3", d.Messages)
	}
	if d.JobMentions != 2 {
		t.Errorf("JobMentions = %d, want 2", d.JobMentions)
	}
}
