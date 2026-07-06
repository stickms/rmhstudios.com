package discordbot

import (
	"strings"
	"testing"
	"time"
)

// ─── chat-embed char-budget packing ─────────────────────────────────────────

// helper: total char count of an embed the way buildChatEmbed budgets it.
func embedCharTotal(title, footer string, fields [][2]string) int {
	total := runeLen(title) + runeLen(footer)
	for _, f := range fields {
		total += runeLen(f[0]) + runeLen(f[1])
	}
	return total
}

func TestBuildChatEmbed_RespectsTotalBudget(t *testing.T) {
	// A huge reply should be packed into multiple fields but never exceed the
	// 6000-char total budget.
	message := "tell me a long story"
	username := "tester"
	reply := strings.Repeat("a", 20000)

	embed := buildChatEmbed(message, username, reply)

	var fields [][2]string
	for _, f := range embed.Fields {
		fields = append(fields, [2]string{f.Name, f.Value})
	}
	total := embedCharTotal(embed.Title, embed.Footer.Text, fields)
	if total > embedTotalMax {
		t.Fatalf("embed total %d exceeds budget %d", total, embedTotalMax)
	}
	if len(embed.Fields) < 2 {
		t.Fatalf("expected reply to be split across multiple fields, got %d", len(embed.Fields))
	}
	for _, f := range embed.Fields {
		if runeLen(f.Value) > fieldValueMax {
			t.Errorf("field %q value len %d exceeds field cap %d", f.Name, runeLen(f.Value), fieldValueMax)
		}
	}
	if len(embed.Fields) > maxFields {
		t.Errorf("field count %d exceeds %d", len(embed.Fields), maxFields)
	}
}

func TestBuildChatEmbed_TruncationEllipsis(t *testing.T) {
	reply := strings.Repeat("z", 30000)
	embed := buildChatEmbed("hi", "u", reply)
	last := embed.Fields[len(embed.Fields)-1]
	if !strings.HasSuffix(last.Value, "…") {
		t.Errorf("expected truncated last field to end with ellipsis, got tail %q", tail(last.Value, 5))
	}
}

func TestBuildChatEmbed_ShortReply(t *testing.T) {
	embed := buildChatEmbed("hey", "bob", "yo whats good")
	if len(embed.Fields) != 2 {
		t.Fatalf("expected 2 fields (You + Alex), got %d", len(embed.Fields))
	}
	if embed.Fields[0].Name != youFieldName || embed.Fields[1].Name != alexFieldName {
		t.Errorf("unexpected field names: %q / %q", embed.Fields[0].Name, embed.Fields[1].Name)
	}
	if embed.Fields[1].Value != "yo whats good" {
		t.Errorf("reply mangled: %q", embed.Fields[1].Value)
	}
}

func TestBuildChatEmbed_EmptyReply(t *testing.T) {
	embed := buildChatEmbed("hey", "bob", "")
	var alex string
	for _, f := range embed.Fields {
		if f.Name == alexFieldName {
			alex = f.Value
		}
	}
	if alex != "(no response)" {
		t.Errorf("expected '(no response)' placeholder, got %q", alex)
	}
}

func tail(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[len(r)-n:])
}

// ─── tamagotchi domain ──────────────────────────────────────────────────────

func TestNewPetDefaults(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	if !p.Alive || p.LifeStage != StageInfant || p.Generation != 1 {
		t.Fatalf("new pet should be a living gen-1 infant, got alive=%v stage=%s gen=%d", p.Alive, p.LifeStage, p.Generation)
	}
	if p.Health != startHealth {
		t.Errorf("new pet health = %v, want %v", p.Health, startHealth)
	}
}

func TestApplyDecayReducesStats(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.applyDecay(now.Add(2 * time.Hour))
	if p.Hunger >= startHunger {
		t.Errorf("hunger should decay over 2h: got %v (start %v)", p.Hunger, startHunger)
	}
	if p.Energy >= startEnergy {
		t.Errorf("energy should decay over 2h: got %v (start %v)", p.Energy, startEnergy)
	}
}

func TestApplyDecayKillsNeglectedPet(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	// A very long neglect gap must drain stats to 0 and then health to 0 → dead.
	res := p.applyDecay(now.Add(1000 * time.Hour))
	if p.Alive {
		t.Fatalf("pet neglected for 1000h should be dead, health=%v", p.Health)
	}
	if !res.Died {
		t.Errorf("decayResult should report Died on the transition")
	}
	if p.DiedAt == nil {
		t.Errorf("DiedAt should be stamped on death")
	}
}

func TestDeadPetDoesNotDecayFurther(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.applyDecay(now.Add(1000 * time.Hour)) // dies
	p.Health = 0
	res := p.applyDecay(now.Add(2000 * time.Hour))
	if res.Died {
		t.Errorf("a already-dead pet should not re-trigger Died")
	}
}

func TestComputeStageByAge(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	cases := []struct {
		ageHours float64
		want     LifeStage
	}{
		{1, StageInfant},
		{13, StageToddler},
		{50, StageChild},
		{130, StageTeen},
		{300, StageAdult},
	}
	for _, c := range cases {
		got := p.computeStage(now.Add(time.Duration(c.ageHours * float64(time.Hour))))
		if got != c.want {
			t.Errorf("age %.0fh: computeStage = %s, want %s", c.ageHours, got, c.want)
		}
	}
}

func TestApplyDecayDetectsGrowUp(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	// Keep him healthy so he stays alive while aging into a toddler.
	p.BornAt = now.Add(-13 * time.Hour)
	res := p.applyDecay(now)
	if !res.GrewUp || p.LifeStage != StageToddler {
		t.Errorf("expected grow-up to toddler, got grew=%v stage=%s", res.GrewUp, p.LifeStage)
	}
}

func TestFeedBobaRaisesHungerAndHappiness(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Hunger, p.Happiness = 40, 40
	r := p.Feed("boba", now)
	if !r.OK || r.Care != "feeds" {
		t.Fatalf("boba feed should succeed and credit feeds, got ok=%v care=%s", r.OK, r.Care)
	}
	if p.Hunger <= 40 || p.Happiness <= 40 {
		t.Errorf("boba should raise hunger (%v) and happiness (%v)", p.Hunger, p.Happiness)
	}
	if p.LastFedAt == nil {
		t.Errorf("LastFedAt should be stamped")
	}
}

func TestPlayRefusedWhenTooTired(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Energy = 10
	r := p.Play(now)
	if r.OK {
		t.Errorf("play should be refused when energy < 15")
	}
}

func TestActionsBlockedWhenDead(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Alive = false
	if r := p.Feed("boba", now); r.OK {
		t.Errorf("cannot feed a dead pet")
	}
	if r := p.Play(now); r.OK {
		t.Errorf("cannot play with a dead pet")
	}
	if r := p.Clean(now); r.OK {
		t.Errorf("cannot clean a dead pet")
	}
}

func TestReviveResetsAndBumpsGeneration(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Name = "Bob"
	p.LastChannelID = "chan123"
	p.Alive = false
	p.Generation = 2
	p.revive(now.Add(time.Hour))
	if !p.Alive || p.Generation != 3 {
		t.Fatalf("revive should produce a living gen-3 pet, got alive=%v gen=%d", p.Alive, p.Generation)
	}
	if p.Name != "Bob" || p.LastChannelID != "chan123" {
		t.Errorf("revive should preserve name (%q) and channel (%q)", p.Name, p.LastChannelID)
	}
	if p.LifeStage != StageInfant {
		t.Errorf("revived pet should be an infant again, got %s", p.LifeStage)
	}
}

func TestMoodPriority(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Hunger = 5 // critically hungry
	if got := p.mood().Key; got != "hungry" {
		t.Errorf("critically hungry pet mood = %q, want hungry", got)
	}
	p.Alive = false
	if got := p.mood().Key; got != "gone" {
		t.Errorf("dead pet mood = %q, want gone", got)
	}
}

func TestNeedsSurfacesCriticalStats(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Hunger = 5
	p.Energy = 5
	needs := p.needs()
	if len(needs) < 2 {
		t.Fatalf("expected at least hungry+sleepy needs, got %v", needs)
	}
}

func TestSanitizePetName(t *testing.T) {
	cases := []struct{ in, want string }{
		{"  Alex  ", "Alex"},
		{"@everyone", "everyone"},
		{"`rm -rf`", "rm -rf"},
		{"", ""},
		{strings.Repeat("x", 40), strings.Repeat("x", 32)},
	}
	for _, c := range cases {
		if got := sanitizePetName(c.in); got != c.want {
			t.Errorf("sanitizePetName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestStatBarBounds(t *testing.T) {
	if bar := statBar(0); !strings.HasPrefix(bar, strings.Repeat("░", 10)) {
		t.Errorf("statBar(0) should be all empty, got %q", bar)
	}
	if bar := statBar(100); !strings.HasPrefix(bar, strings.Repeat("█", 10)) {
		t.Errorf("statBar(100) should be all full, got %q", bar)
	}
	if bar := statBar(150); !strings.Contains(bar, "100/100") {
		t.Errorf("statBar should clamp >100 to 100, got %q", bar)
	}
}

func TestBuildAlexImagePromptSafe(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	prompt := buildAlexImagePrompt(p, p.mood())
	if !strings.Contains(prompt, "No text") {
		t.Errorf("image prompt should forbid text, got %q", prompt)
	}
	if !strings.Contains(strings.ToLower(prompt), "baby") {
		t.Errorf("infant prompt should describe a baby, got %q", prompt)
	}
}
