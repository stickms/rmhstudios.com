package botworker

import (
	"testing"
	"time"
)

func TestCanBotMessage(t *testing.T) {
	cases := []struct {
		privacy DmPrivacy
		follows bool
		want    bool
	}{
		{"NONE", true, false},
		{"NONE", false, false},
		{"FOLLOWERS", true, true},
		{"FOLLOWERS", false, false},
		{"EVERYONE", false, true},
		{"EVERYONE", true, true},
		{"garbage", false, false},
	}
	for _, c := range cases {
		if got := canBotMessage(c.privacy, c.follows); got != c.want {
			t.Errorf("canBotMessage(%q, %v) = %v, want %v", c.privacy, c.follows, got, c.want)
		}
	}
}

func TestDecideInitiation(t *testing.T) {
	now := time.Now()
	bot := "bot1"
	silence := 3 * 24 * time.Hour

	// No conversation -> opener.
	if d := decideInitiation(bot, now, silence, nil); d != "opener" {
		t.Errorf("nil messages => %q, want opener", d)
	}
	if d := decideInitiation(bot, now, silence, []policyMessage{}); d != "opener" {
		t.Errorf("empty messages => %q, want opener", d)
	}

	// Human has replied -> skip.
	msgs := []policyMessage{
		{SenderID: "bot1", CreatedAt: now.Add(-10 * time.Hour)},
		{SenderID: "human1", CreatedAt: now.Add(-9 * time.Hour)},
	}
	if d := decideInitiation(bot, now, silence, msgs); d != "skip" {
		t.Errorf("human replied => %q, want skip", d)
	}

	// Two unanswered bot messages -> skip.
	two := []policyMessage{
		{SenderID: "bot1", CreatedAt: now.Add(-10 * time.Hour)},
		{SenderID: "bot1", CreatedAt: now.Add(-9 * time.Hour)},
	}
	if d := decideInitiation(bot, now, silence, two); d != "skip" {
		t.Errorf("two bot msgs => %q, want skip", d)
	}

	// One unanswered bot opener, enough silence -> followup.
	old := []policyMessage{{SenderID: "bot1", CreatedAt: now.Add(-4 * 24 * time.Hour)}}
	if d := decideInitiation(bot, now, silence, old); d != "followup" {
		t.Errorf("one old bot msg => %q, want followup", d)
	}

	// One unanswered bot opener, not enough silence -> skip.
	recent := []policyMessage{{SenderID: "bot1", CreatedAt: now.Add(-1 * time.Hour)}}
	if d := decideInitiation(bot, now, silence, recent); d != "skip" {
		t.Errorf("one recent bot msg => %q, want skip", d)
	}
}

func TestFormatDmHistory(t *testing.T) {
	msgs := []dmMessage{
		{SenderID: "human1", Content: "hi"},
		{SenderID: "bot1", Content: "hello"},
	}
	turns := formatDmHistory(msgs, "bot1")
	if len(turns) != 2 {
		t.Fatalf("got %d turns", len(turns))
	}
	if turns[0].From != "them" || turns[0].Text != "hi" {
		t.Errorf("turn0 = %+v, want them/hi", turns[0])
	}
	if turns[1].From != "you" || turns[1].Text != "hello" {
		t.Errorf("turn1 = %+v, want you/hello", turns[1])
	}
}

func TestOrderPair(t *testing.T) {
	a, b := orderPair("zeta", "alpha")
	if a != "alpha" || b != "zeta" {
		t.Errorf("orderPair = (%q,%q), want (alpha,zeta)", a, b)
	}
	a, b = orderPair("alpha", "zeta")
	if a != "alpha" || b != "zeta" {
		t.Errorf("orderPair = (%q,%q), want (alpha,zeta)", a, b)
	}
}
