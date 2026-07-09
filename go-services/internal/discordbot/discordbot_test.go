package discordbot

import (
	"strings"
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"
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

func TestStartNewLifeResetsAndBumpsGeneration(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Name = "Bob"
	p.LastChannelID = "chan123"
	p.Alive = false
	p.Generation = 2
	p.startNewLife(now.Add(time.Hour))
	if !p.Alive || p.Generation != 3 {
		t.Fatalf("startNewLife should produce a living gen-3 pet, got alive=%v gen=%d", p.Alive, p.Generation)
	}
	if p.Name != "Bob" || p.LastChannelID != "chan123" {
		t.Errorf("startNewLife should preserve name (%q) and channel (%q)", p.Name, p.LastChannelID)
	}
	if p.LifeStage != StageInfant {
		t.Errorf("reincarnated pet should be an infant again, got %s", p.LifeStage)
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

func TestStudyBuildsIntelligence(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	before := p.Intelligence
	r := p.Study(now)
	if !r.OK || r.Care != "studies" {
		t.Fatalf("study should succeed and credit studies, got ok=%v care=%s", r.OK, r.Care)
	}
	if p.Intelligence <= before {
		t.Errorf("study should raise intelligence: %v -> %v", before, p.Intelligence)
	}
	if p.Energy >= startEnergy {
		t.Errorf("study should cost energy, got %v", p.Energy)
	}
	if p.LastStudiedAt == nil {
		t.Errorf("LastStudiedAt should be stamped")
	}
}

func TestStudyRefusedWhenExhausted(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Energy = 10
	if r := p.Study(now); r.OK {
		t.Errorf("study should be refused when too tired")
	}
}

func TestStartNewLifeCarriesLegacyIntelligence(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	p.Name = "Bob"
	p.LastChannelID = "chan1"
	p.Intelligence = 80
	p.Career = "swe"
	p.Generation = 2
	p.startNewLife(now.Add(time.Hour))

	if p.Generation != 3 || !p.Alive || p.LifeStage != StageInfant {
		t.Fatalf("new life should be a living gen-3 infant, got gen=%d alive=%v stage=%s", p.Generation, p.Alive, p.LifeStage)
	}
	if p.Name != "Bob" || p.LastChannelID != "chan1" {
		t.Errorf("new life should preserve name (%q) and channel (%q)", p.Name, p.LastChannelID)
	}
	if p.Career != "" {
		t.Errorf("new life should clear career, got %q", p.Career)
	}
	want := legacyIntelligenceBonus(80)
	if p.Intelligence != want {
		t.Errorf("legacy intelligence = %v, want %v", p.Intelligence, want)
	}
	if p.Intelligence > 30 {
		t.Errorf("legacy bonus should be capped at 30, got %v", p.Intelligence)
	}
}

func TestCanGraduateOnlyAsLivingAdult(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	if p.canGraduate() {
		t.Errorf("an infant should not be able to graduate")
	}
	p.LifeStage = StageAdult
	if !p.canGraduate() {
		t.Errorf("a living adult should be able to graduate")
	}
	p.Alive = false
	if p.canGraduate() {
		t.Errorf("a dead adult should not be able to graduate (revive instead)")
	}
}

func TestValidCareer(t *testing.T) {
	if !validCareer("swe") || !validCareer("quant") {
		t.Errorf("swe/quant should be valid careers")
	}
	if validCareer("astronaut") || validCareer("") {
		t.Errorf("unknown/empty careers should be invalid")
	}
	if careerDisplay("") == "" {
		t.Errorf("careerDisplay of empty should return an 'undecided' label, not empty")
	}
}

func TestWantsMessage(t *testing.T) {
	cases := []struct {
		level string
		kind  proactiveKind
		want  bool
	}{
		{msgLevelAll, kindAmbient, true},
		{msgLevelAll, kindCareAlert, true},
		{msgLevelAll, kindGrewUp, true},
		{msgLevelAll, kindDied, true},
		{msgLevelCare, kindAmbient, false}, // care-only drops random ambient
		{msgLevelCare, kindCareAlert, true},
		{msgLevelCare, kindGrewUp, true}, // life events still count as care
		{msgLevelCare, kindDied, true},
		{msgLevelOff, kindAmbient, false},
		{msgLevelOff, kindCareAlert, false},
		{msgLevelOff, kindGrewUp, false},
		{msgLevelOff, kindDied, false},
		{"", kindAmbient, true}, // unknown/empty defaults to "all"
	}
	for _, c := range cases {
		if got := wantsMessage(c.level, c.kind); got != c.want {
			t.Errorf("wantsMessage(%q, %v) = %v, want %v", c.level, c.kind, got, c.want)
		}
	}
}

func TestPresenceReflectsState(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	p := newPet("g1", now)
	if txt := presenceText(p); !strings.Contains(txt, "Baby Alex") {
		t.Errorf("infant presence should mention Baby Alex, got %q", txt)
	}
	if s := presenceStatus(p); s != "online" {
		t.Errorf("healthy pet should be online, got %q", s)
	}
	p.Alive = false
	if txt := presenceText(p); !strings.Contains(txt, "passed out") {
		t.Errorf("dead pet presence should say passed out, got %q", txt)
	}
	if s := presenceStatus(p); s != "dnd" {
		t.Errorf("dead pet should be dnd, got %q", s)
	}
}

func TestCanToggleAlex(t *testing.T) {
	// OwnerID has stray whitespace to prove the comparison trims it.
	b := &Bot{cfg: Config{OwnerID: " owner1 "}}

	mk := func(userID string, perms int64) *discordgo.InteractionCreate {
		return &discordgo.InteractionCreate{Interaction: &discordgo.Interaction{
			Member: &discordgo.Member{User: &discordgo.User{ID: userID}, Permissions: perms},
		}}
	}

	cases := []struct {
		name  string
		i     *discordgo.InteractionCreate
		allow bool
	}{
		{"bot owner (no perms, env has whitespace)", mk("owner1", 0), true},
		{"manage messages", mk("u2", discordgo.PermissionManageMessages), true},
		{"administrator", mk("u3", discordgo.PermissionAdministrator), true},
		{"manage + other perms", mk("u4", discordgo.PermissionManageMessages|discordgo.PermissionViewChannel), true},
		{"regular member", mk("u5", discordgo.PermissionViewChannel|discordgo.PermissionSendMessages), false},
		{"no perms", mk("u6", 0), false},
	}
	for _, c := range cases {
		// Session is nil here; the owner + permission paths don't need it.
		if got := b.canToggleAlex(nil, c.i); got != c.allow {
			t.Errorf("%s: canToggleAlex = %v, want %v", c.name, got, c.allow)
		}
	}

	// A nil member (e.g. a DM) is never allowed unless it's the owner.
	if b.canToggleAlex(nil, &discordgo.InteractionCreate{Interaction: &discordgo.Interaction{}}) {
		t.Error("nil member should not be allowed")
	}
}

func TestBoundMessage(t *testing.T) {
	if got := boundMessage(`  "hey there"  `); got != "hey there" {
		t.Errorf("boundMessage should trim spaces + surrounding quotes, got %q", got)
	}
	long := strings.Repeat("a", 800)
	got := boundMessage(long)
	if len([]rune(got)) > 601 { // 600 + ellipsis
		t.Errorf("boundMessage should cap length, got %d runes", len([]rune(got)))
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("over-long message should end with an ellipsis")
	}
}

func TestCleanDiscordContent(t *testing.T) {
	cases := []struct{ in, want string }{
		{"<@123> hey", "Alex hey"},
		{"<@!123> yo", "Alex yo"},
		{"  hello  ", "hello"},
		{"no mention", "no mention"},
	}
	for _, c := range cases {
		if got := cleanDiscordContent(c.in, "123"); got != c.want {
			t.Errorf("cleanDiscordContent(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestTranscriptTurnRoles(t *testing.T) {
	bot := transcriptTurn(&discordgo.Message{Author: &discordgo.User{ID: "bot"}, Content: "hi im alex"}, "bot")
	if len(bot) != 1 || bot[0].Role != roleAssistant {
		t.Errorf("bot's own message should be an assistant turn, got %+v", bot)
	}
	user := transcriptTurn(&discordgo.Message{Author: &discordgo.User{ID: "u1", Username: "bob"}, Content: "sup"}, "bot")
	if len(user) != 1 || user[0].Role != roleUser || !strings.HasPrefix(user[0].Content, "bob: ") {
		t.Errorf("other user's message should be a name-prefixed user turn, got %+v", user)
	}
	if empty := transcriptTurn(&discordgo.Message{Author: &discordgo.User{ID: "u1"}, Content: "   "}, "bot"); empty != nil {
		t.Errorf("empty-content message should produce no turn, got %+v", empty)
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

func TestWantsMessagePrompt(t *testing.T) {
	// Interactive community prompts follow the same rules as ambient chatter.
	if !wantsMessage(msgLevelAll, kindPrompt) {
		t.Errorf("'all' should allow prompts")
	}
	if wantsMessage(msgLevelCare, kindPrompt) {
		t.Errorf("'care' should drop prompts (they're random chatter)")
	}
	if wantsMessage(msgLevelOff, kindPrompt) {
		t.Errorf("'off' should drop prompts")
	}
}

func TestNormalizeCareer(t *testing.T) {
	cases := map[string]string{
		"swe":               "swe",
		"Software Engineer": "swe",
		"developer":         "swe",
		"quant":             "quant",
		"UX":                "design",
		"product manager":   "pm",
		"astronaut":         "", // custom → no known key
		"":                  "",
		"   ":               "",
	}
	for in, want := range cases {
		if got := normalizeCareer(in); got != want {
			t.Errorf("normalizeCareer(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSanitizeCareer(t *testing.T) {
	if got := sanitizeCareer("  astronaut  "); got != "astronaut" {
		t.Errorf("expected trimmed 'astronaut', got %q", got)
	}
	if got := sanitizeCareer("@everyone `rm -rf` *boss*"); strings.ContainsAny(got, "@`*") {
		t.Errorf("should strip injection/markdown chars, got %q", got)
	}
	if sanitizeCareer("   ") != "" {
		t.Errorf("blank input should sanitize to empty")
	}
	if len([]rune(sanitizeCareer(strings.Repeat("x", 100)))) > 40 {
		t.Errorf("should cap at 40 runes")
	}
}

func TestCareerDisplayCustom(t *testing.T) {
	if careerDisplay("swe") != careerLabel["swe"] {
		t.Errorf("known key should map to its label")
	}
	if got := careerDisplay("pro boba taster"); got != "pro boba taster" {
		t.Errorf("custom career should show as typed, got %q", got)
	}
}

func TestClaimPromptOncePerUser(t *testing.T) {
	ps := &PetService{}
	now := time.Unix(1_700_000_000, 0).UTC()
	ps.registerPrompt(promptStyleEvent, map[string]bool{"chanA": true}, now)

	if !ps.claimPrompt("chanA", "user1", now) {
		t.Fatalf("first claim should succeed")
	}
	if ps.claimPrompt("chanA", "user1", now) {
		t.Errorf("second claim by the same user should fail")
	}
	if !ps.claimPrompt("chanA", "user2", now) {
		t.Errorf("a different user should still be able to claim")
	}
	if ps.claimPrompt("chanB", "user3", now) {
		t.Errorf("a claim in a non-prompt channel should fail")
	}
	if ps.claimPrompt("chanA", "user4", now.Add(promptDuration()+time.Second)) {
		t.Errorf("an expired prompt should not be claimable")
	}
}

func TestClaimPromptRespectsCap(t *testing.T) {
	ps := &PetService{}
	now := time.Unix(1_700_000_000, 0).UTC()
	ps.registerPrompt(promptStyleQuestion, map[string]bool{"c": true}, now)

	claimed := 0
	for i := 0; i < promptMaxClaims+5; i++ {
		if ps.claimPrompt("c", "user"+itoa(i), now) {
			claimed++
		}
	}
	if claimed != promptMaxClaims {
		t.Errorf("expected exactly %d winners (cap), got %d", promptMaxClaims, claimed)
	}
}
