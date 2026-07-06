// pet.go is the pure domain model for the "Alex" tamagotchi: the per-guild pet
// state, its stat-decay math, life-stage progression, mood derivation, and the
// care actions (feed / play / clean / rest). It has NO I/O — the DB lives in
// pet_repo.go, Discord/xAI orchestration in pet_service.go, and the background
// caretaking loop in pet_care.go — so all of the game rules are unit-testable in
// isolation.
package discordbot

import (
	"math/rand"
	"os"
	"strconv"
	"time"
)

// ─── Life stages ────────────────────────────────────────────────────────

// LifeStage is Alex's developmental stage, driven by age (and gated on being
// alive — a dead Alex stops growing until revived).
type LifeStage string

const (
	StageInfant  LifeStage = "infant"
	StageToddler LifeStage = "toddler"
	StageChild   LifeStage = "child"
	StageTeen    LifeStage = "teen"
	StageAdult   LifeStage = "adult"
)

// stageOrder is used to detect "grew up" transitions (a higher index = older).
var stageOrder = map[LifeStage]int{
	StageInfant: 0, StageToddler: 1, StageChild: 2, StageTeen: 3, StageAdult: 4,
}

// stageThreshold maps a minimum age (in hours) to the stage reached at that age.
// Ordered oldest-first so computeStage returns the first threshold the age meets.
type stageThreshold struct {
	stage    LifeStage
	minHours float64
}

var stageThresholds = []stageThreshold{
	{StageAdult, 240},  // 10 days
	{StageTeen, 120},   // 5 days
	{StageChild, 48},   // 2 days
	{StageToddler, 12}, // 12 hours
	{StageInfant, 0},   // birth
}

// stageLabel is the human-facing name shown in embeds.
var stageLabel = map[LifeStage]string{
	StageInfant:  "Infant 👶",
	StageToddler: "Toddler 🧒",
	StageChild:   "Kid 🧑",
	StageTeen:    "Teen 🧑‍🎓",
	StageAdult:   "Adult 🧑‍💻",
}

// ─── Tunable rates (env-overridable via configurePetRates) ──────────────
//
// Package-level so ops can tune pacing without a redeploy, but they default to
// values that make Alex need attention a few times a day and reach adulthood
// over roughly ten real days. Tests rely on the defaults.
var (
	growthScale         = 1.0 // multiplies age when computing stage (>1 = grows faster)
	hungerDecayPerHour  = 8.0
	happyDecayPerHour   = 5.0
	energyDecayPerHour  = 6.0
	hygieneDecayPerHour = 5.0
	healthRegenPerHour  = 4.0 // health recovered per hour while thriving
	healthDrainPerHour  = 6.0 // health lost per hour, per critically-low stat
)

// configurePetRates applies optional env overrides to the tamagotchi pacing so
// ops can speed up (e.g. for a test server) or slow down the game without a code
// change. Called once at startup. Unset / invalid values keep the defaults.
func configurePetRates() {
	envFloat := func(key string, target *float64) {
		if v := os.Getenv(key); v != "" {
			if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
				*target = f
			}
		}
	}
	envFloat("ALEX_GROWTH_SCALE", &growthScale)
	envFloat("ALEX_HUNGER_DECAY", &hungerDecayPerHour)
	envFloat("ALEX_HAPPY_DECAY", &happyDecayPerHour)
	envFloat("ALEX_ENERGY_DECAY", &energyDecayPerHour)
	envFloat("ALEX_HYGIENE_DECAY", &hygieneDecayPerHour)
}

// criticalThreshold is the stat level below which a need becomes "critical"
// (drives health drain and care alerts).
const criticalThreshold = 15.0

// Starting stats for a freshly born (or revived) Alex.
const (
	startHunger    = 80.0
	startHappiness = 80.0
	startEnergy    = 90.0
	startHygiene   = 90.0
	startHealth    = 100.0
)

// ─── Pet state ──────────────────────────────────────────────────────────

// PetState is one guild's Alex. It mirrors the discord_alex_pet row 1:1; the
// repo marshals/unmarshals it and the service mutates it through the methods
// below.
type PetState struct {
	GuildID    string
	Name       string
	Generation int
	BornAt     time.Time

	Hunger    float64
	Happiness float64
	Energy    float64
	Hygiene   float64
	Health    float64

	Alive     bool
	LifeStage LifeStage // last persisted stage; used to detect stage-ups

	StatsUpdatedAt    time.Time
	LastInteractionAt time.Time
	LastChannelID     string

	LastFedAt     *time.Time
	LastPlayedAt  *time.Time
	LastCleanedAt *time.Time
	LastSleptAt   *time.Time
	LastChatAt    *time.Time

	LastCareAlertAt *time.Time
	LastAmbientAt   *time.Time
	DiedAt          *time.Time

	CreatedAt time.Time
	UpdatedAt time.Time
}

// newPet builds a fresh Alex for a guild, born now.
func newPet(guildID string, now time.Time) *PetState {
	return &PetState{
		GuildID:           guildID,
		Name:              "Alex",
		Generation:        1,
		BornAt:            now,
		Hunger:            startHunger,
		Happiness:         startHappiness,
		Energy:            startEnergy,
		Hygiene:           startHygiene,
		Health:            startHealth,
		Alive:             true,
		LifeStage:         StageInfant,
		StatsUpdatedAt:    now,
		LastInteractionAt: now,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
}

// revive resets a (usually dead) Alex back to a newborn, bumping the generation
// so the guild's caretaking history reads like a new life.
func (p *PetState) revive(now time.Time) {
	gen := p.Generation + 1
	name := p.Name
	channel := p.LastChannelID
	*p = *newPet(p.GuildID, now)
	p.Generation = gen
	p.Name = name
	p.LastChannelID = channel
}

// clampStat bounds a stat to [0, 100].
func clampStat(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// ─── Decay ──────────────────────────────────────────────────────────────

// applyDecay advances the pet's stats to `now` using lazy (elapsed-time)
// integration: stats drop proportional to the hours since StatsUpdatedAt, health
// drains while needs are critical and slowly regenerates while Alex is thriving,
// and Alex dies if health hits zero. This is called on every load so the DB never
// has to be ticked on a fixed schedule — the state is always correct-as-of-now.
//
// Returns transitions the caller may want to announce.
type decayResult struct {
	Died        bool // Alex was alive and is now dead
	StageBefore LifeStage
	StageAfter  LifeStage
	GrewUp      bool
}

func (p *PetState) applyDecay(now time.Time) decayResult {
	res := decayResult{StageBefore: p.LifeStage, StageAfter: p.LifeStage}

	if p.StatsUpdatedAt.IsZero() {
		p.StatsUpdatedAt = now
	}
	hours := now.Sub(p.StatsUpdatedAt).Hours()

	if p.Alive && hours > 0 {
		p.Hunger = clampStat(p.Hunger - hungerDecayPerHour*hours)
		p.Happiness = clampStat(p.Happiness - happyDecayPerHour*hours)
		p.Energy = clampStat(p.Energy - energyDecayPerHour*hours)
		p.Hygiene = clampStat(p.Hygiene - hygieneDecayPerHour*hours)

		critical := 0
		for _, s := range []float64{p.Hunger, p.Happiness, p.Energy, p.Hygiene} {
			if s < criticalThreshold {
				critical++
			}
		}
		switch {
		case critical > 0:
			p.Health = clampStat(p.Health - healthDrainPerHour*float64(critical)*hours)
		case p.Hunger > 60 && p.Happiness > 60 && p.Energy > 40 && p.Hygiene > 60:
			p.Health = clampStat(p.Health + healthRegenPerHour*hours)
		}

		if p.Health <= 0 {
			p.Health = 0
			p.Alive = false
			t := now
			p.DiedAt = &t
			res.Died = true
		}
	}
	if hours > 0 {
		p.StatsUpdatedAt = now
	}

	// Recompute the life stage (only living pets grow).
	if p.Alive {
		newStage := p.computeStage(now)
		if stageOrder[newStage] > stageOrder[p.LifeStage] {
			res.GrewUp = true
		}
		p.LifeStage = newStage
	}
	res.StageAfter = p.LifeStage
	return res
}

// computeStage returns the life stage implied by Alex's age (scaled by
// growthScale).
func (p *PetState) computeStage(now time.Time) LifeStage {
	age := now.Sub(p.BornAt).Hours() * growthScale
	for _, t := range stageThresholds {
		if age >= t.minHours {
			return t.stage
		}
	}
	return StageInfant
}

// ageString renders Alex's age as a friendly "3d 4h" / "5h" / "12m" string.
func (p *PetState) ageString(now time.Time) string {
	d := now.Sub(p.BornAt)
	if d < 0 {
		d = 0
	}
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	mins := int(d.Minutes()) % 60
	switch {
	case days > 0:
		return itoa(days) + "d " + itoa(hours) + "h"
	case hours > 0:
		return itoa(hours) + "h " + itoa(mins) + "m"
	default:
		return itoa(mins) + "m"
	}
}

// ─── Mood ───────────────────────────────────────────────────────────────

// Mood is Alex's current vibe, derived from stats. Key is a stable identifier
// used for image cache keys; Emoji/Label are for display.
type Mood struct {
	Key   string
	Emoji string
	Label string
}

// mood derives the current mood from stats, most-urgent-first so a hungry AND
// tired Alex surfaces the most pressing need.
func (p *PetState) mood() Mood {
	if !p.Alive {
		return Mood{"gone", "💀", "gone (needs a revive)"}
	}
	switch {
	case p.Health < 25:
		return Mood{"sick", "🤒", "feelin real sick, need some care fr"}
	case p.Energy < 20:
		return Mood{"sleepy", "😴", "lowkey exhausted, need a nap"}
	case p.Hunger < 20:
		return Mood{"hungry", "🍽️", "starving no cap"}
	case p.Hygiene < 20:
		return Mood{"stinky", "🧼", "kinda funky rn, need a wash"}
	case p.Happiness < 25:
		return Mood{"sad", "🥺", "feelin down, could use some company"}
	case p.Hunger > 70 && p.Happiness > 70 && p.Energy > 60 && p.Hygiene > 60:
		return Mood{"thriving", "✨", "thriving fr fr"}
	default:
		return Mood{"chillin", "🧋", "just vibin"}
	}
}

// needs returns the critical-need keys (used by the care loop to decide whether
// to send an alert). Empty when Alex is content and alive.
func (p *PetState) needs() []string {
	if !p.Alive {
		return []string{"gone"}
	}
	var out []string
	if p.Health < 25 {
		out = append(out, "sick")
	}
	if p.Hunger < criticalThreshold {
		out = append(out, "hungry")
	}
	if p.Energy < criticalThreshold {
		out = append(out, "sleepy")
	}
	if p.Hygiene < criticalThreshold {
		out = append(out, "stinky")
	}
	if p.Happiness < criticalThreshold {
		out = append(out, "sad")
	}
	return out
}

// ─── Care actions ───────────────────────────────────────────────────────
//
// Each action mutates stats and returns a first-person Alex reaction line. The
// caller is responsible for having called applyDecay(now) first and for stamping
// timestamps / persisting. Actions never operate on a dead Alex (guarded here so
// callers can't accidentally "feed a corpse").

// actionResult carries the flavor line plus whether the action actually applied.
type actionResult struct {
	Message string
	OK      bool
	Care    string // caretaker counter to increment: "feeds"/"plays"/"cleans"/"naps"/"talks"
}

func (p *PetState) dead() actionResult {
	return actionResult{Message: "Alex ain't with us rn 💀 — hit `/revive` to bring him back for a fresh start 🙏", OK: false}
}

// Feed restores hunger (and a little joy — boba especially). kind ∈ boba/meal/snack.
func (p *PetState) Feed(kind string, now time.Time) actionResult {
	if !p.Alive {
		return p.dead()
	}
	stuffed := p.Hunger > 92
	switch kind {
	case "boba":
		p.Hunger = clampStat(p.Hunger + 25)
		p.Happiness = clampStat(p.Happiness + 15)
	case "meal":
		p.Hunger = clampStat(p.Hunger + 45)
		p.Happiness = clampStat(p.Happiness + 5)
	case "snack":
		p.Hunger = clampStat(p.Hunger + 18)
		p.Happiness = clampStat(p.Happiness + 8)
	default:
		return actionResult{Message: "idk what that is bro 😅", OK: false}
	}
	t := now
	p.LastFedAt = &t
	if stuffed {
		return actionResult{Message: pick(feedStuffedLines), OK: true, Care: "feeds"}
	}
	if kind == "boba" {
		return actionResult{Message: pick(feedBobaLines), OK: true, Care: "feeds"}
	}
	return actionResult{Message: pick(feedFoodLines), OK: true, Care: "feeds"}
}

// Play raises happiness at the cost of energy (and a little hunger/hygiene). Alex
// refuses if he's too tired.
func (p *PetState) Play(now time.Time) actionResult {
	if !p.Alive {
		return p.dead()
	}
	if p.Energy < 15 {
		return actionResult{Message: "Alex too gassed to play rn 😴 — let him `/rest` first", OK: false}
	}
	p.Happiness = clampStat(p.Happiness + 28)
	p.Energy = clampStat(p.Energy - 18)
	p.Hunger = clampStat(p.Hunger - 6)
	p.Hygiene = clampStat(p.Hygiene - 5)
	t := now
	p.LastPlayedAt = &t
	return actionResult{Message: pick(playLines), OK: true, Care: "plays"}
}

// Clean restores hygiene fully.
func (p *PetState) Clean(now time.Time) actionResult {
	if !p.Alive {
		return p.dead()
	}
	p.Hygiene = 100
	p.Happiness = clampStat(p.Happiness + 6)
	t := now
	p.LastCleanedAt = &t
	return actionResult{Message: pick(cleanLines), OK: true, Care: "cleans"}
}

// Rest restores energy (and a little health/joy).
func (p *PetState) Rest(now time.Time) actionResult {
	if !p.Alive {
		return p.dead()
	}
	if p.Energy > 90 {
		return actionResult{Message: "Alex ain't even tired rn 😎 — 'I'm locked in, no naps needed'", OK: false}
	}
	p.Energy = clampStat(p.Energy + 65)
	p.Happiness = clampStat(p.Happiness + 5)
	p.Health = clampStat(p.Health + 5)
	t := now
	p.LastSleptAt = &t
	return actionResult{Message: pick(restLines), OK: true, Care: "naps"}
}

// ─── Flavor text ────────────────────────────────────────────────────────

var feedBobaLines = []string{
	"Alex slurped that boba down instantly 🧋 — \"BROOO this is bussin fr fr, you the GOAT 🐐\"",
	"boba secured 🧋 — \"deadass needed this, you carried today no cap\"",
	"Alex hit the boba like it owed him money 🧋 — \"extra tapioca? it's giving luxury fr\"",
	"\"sheeeesh 50% sugar boba? you KNOW me\" — Alex is thriving 🧋",
}

var feedFoodLines = []string{
	"Alex demolished it 🍜 — \"ok that HIT different, appreciate you fr\"",
	"cleared the plate 🍱 — \"lowkey needed the fuel, back to grinding\"",
	"\"that slaps ngl\" — Alex is fed and happy 😋",
}

var feedStuffedLines = []string{
	"Alex is deadass stuffed 😵‍💫 — \"bro I can't, I'm so full, save some for later\"",
	"\"ok ok I ate, chill lol\" — Alex tapping out, he's stuffed 🍽️",
}

var playLines = []string{
	"played some 2K with Alex 🎮 — \"RUN IT BACK, I'm cracked at this fr\"",
	"Alex hit the griddy 🕺 — \"caught that on camera? postin it fr\"",
	"vibe-coded a lil app together 💻 — \"we shipped it, no planning, pure vibes 🚀\"",
	"showed Alex a meme 😭 — \"NAHHH that's crazy, I'm cryin bro\"",
}

var cleanLines = []string{
	"scrubbed Alex up 🧼 — \"squeaky clean, smellin like success fr\"",
	"fresh fit, fresh vibes 🚿 — \"ok I'm lookin CRISP now, LinkedIn pic incoming\"",
	"Alex all cleaned up ✨ — \"hygiene is self care, remember that\"",
}

var restLines = []string{
	"tucked Alex in 😴 — \"aight power nap then back to the grind, bet\"",
	"Alex caught some Z's 💤 — \"dreamt I got the return offer, manifesting fr\"",
	"recharged 🔋 — \"ok I'm locked back in, let's cook\"",
}

// ─── Small helpers ──────────────────────────────────────────────────────

// pick returns a random element (safe on empty slices).
func pick(xs []string) string {
	if len(xs) == 0 {
		return ""
	}
	return xs[rand.Intn(len(xs))]
}

// itoa is a tiny int->string without importing strconv everywhere pet.go builds
// display strings.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
