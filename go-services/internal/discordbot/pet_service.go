// pet_service.go orchestrates the Alex tamagotchi: it turns slash commands into
// state mutations, renders the status/embed cards, generates the xAI selfie for
// /show, and maintains the caretaker leaderboard. It also holds the discordgo
// session used by the background caretaking loop (pet_care.go).
//
// Concurrency: every mutation of a guild's pet goes through lockGuild → load →
// applyDecay → mutate → save, so simultaneous commands in the same guild can't
// race the read-modify-write cycle. The one exception (xAI image generation for
// /show) deliberately runs OUTSIDE the lock on a snapshot, so a 60s image call
// never blocks other caretakers.
package discordbot

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// PetService is the tamagotchi command surface.
type PetService struct {
	repo   *petRepo
	imager *alexImager
	logger *log.Logger

	mu         sync.Mutex
	guildLocks map[string]*sync.Mutex
	cooldowns  map[string]time.Time // key "guildId:action" -> last run

	sessMu  sync.RWMutex
	session *discordgo.Session // set once the gateway is open (for the care loop)
}

// NewPetService wires the tamagotchi.
func NewPetService(repo *petRepo, imager *alexImager, logger *log.Logger) *PetService {
	return &PetService{
		repo:       repo,
		imager:     imager,
		logger:     logger,
		guildLocks: make(map[string]*sync.Mutex),
		cooldowns:  make(map[string]time.Time),
	}
}

// carePoints weights each care action for the leaderboard.
var carePoints = map[string]int{"feeds": 10, "plays": 8, "cleans": 6, "naps": 5, "talks": 3}

// showCooldown bounds how often a guild can spend an xAI image on /show.
const showCooldown = 45 * time.Second

// ─── Locking & cooldowns ────────────────────────────────────────────────

func (ps *PetService) lockGuild(guildID string) *sync.Mutex {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	m, ok := ps.guildLocks[guildID]
	if !ok {
		m = &sync.Mutex{}
		ps.guildLocks[guildID] = m
	}
	return m
}

// onCooldown reports whether action is still cooling down for a guild, and if not,
// stamps it as used now.
func (ps *PetService) onCooldown(guildID, action string, d time.Duration, now time.Time) bool {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	key := guildID + ":" + action
	if last, ok := ps.cooldowns[key]; ok && now.Sub(last) < d {
		return true
	}
	ps.cooldowns[key] = now
	return false
}

// ─── Session handle (for the care loop) ─────────────────────────────────

func (ps *PetService) setSession(s *discordgo.Session) {
	ps.sessMu.Lock()
	ps.session = s
	ps.sessMu.Unlock()
}

func (ps *PetService) getSession() *discordgo.Session {
	ps.sessMu.RLock()
	defer ps.sessMu.RUnlock()
	return ps.session
}

// ─── Load helper ────────────────────────────────────────────────────────

// loadDecay loads (or creates) a guild's pet, applies time decay, and stamps the
// interaction channel/time. The caller MUST hold the guild lock. Returns the pet
// and the decay transitions (grew up / died) so the handler can note them.
func (ps *PetService) loadDecay(ctx context.Context, guildID, channelID string, now time.Time) (*PetState, decayResult, error) {
	pet, ok, err := ps.repo.load(ctx, guildID)
	if err != nil {
		return nil, decayResult{}, err
	}
	if !ok {
		pet = newPet(guildID, now)
	}
	res := pet.applyDecay(now)
	if channelID != "" {
		pet.LastChannelID = channelID
	}
	pet.LastInteractionAt = now
	return pet, res, nil
}

// creditCaretaker records a caretaker's action for the leaderboard (best-effort).
func (ps *PetService) creditCaretaker(ctx context.Context, guildID, userID, username, care string) {
	if care == "" {
		return
	}
	pts := carePoints[care]
	if err := ps.repo.bumpCaretaker(ctx, guildID, userID, username, care, pts); err != nil {
		ps.logger.Warn("caretaker credit failed", "guild", guildID, "user", userID, "error", err)
	}
}

// ─── Guard + response helpers ───────────────────────────────────────────

// requireGuild rejects DM usage (Alex is a per-server communal pet).
func requireGuild(s *discordgo.Session, i *discordgo.InteractionCreate) (string, bool) {
	if i.GuildID == "" {
		_ = respondText(s, i, "Alex lives in servers, not DMs 🏠 — use these commands in a server channel.")
		return "", false
	}
	return i.GuildID, true
}

func deferReply(s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	})
}

func (ps *PetService) editEmbed(s *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed, files []*discordgo.File) error {
	edit := &discordgo.WebhookEdit{Embeds: &[]*discordgo.MessageEmbed{embed}}
	if files != nil {
		edit.Files = files
	}
	_, err := s.InteractionResponseEdit(i.Interaction, edit)
	return err
}

// ─── Commands ───────────────────────────────────────────────────────────

// HandleStatus implements /alex — the status card (stats + any cached selfie).
func (ps *PetService) HandleStatus(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()

	mu := ps.lockGuild(guildID)
	mu.Lock()
	pet, res, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("couldn't check on Alex rn"), nil)
	}
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("status save failed", "guild", guildID, "error", err)
	}
	mood := pet.mood()
	snap := *pet
	mu.Unlock()

	embed := ps.statusEmbed(&snap, mood, now, res)

	// Attach a cached selfie if one is already on hand (never generate here —
	// /show is the paid path).
	var files []*discordgo.File
	if img, ok := ps.imager.cached(&snap, mood, now); ok {
		embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
		files = append(files, imageFile(img))
	}
	return ps.editEmbed(s, i, embed, files)
}

// HandleFeed implements /feed.
func (ps *PetService) HandleFeed(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate, kind string) error {
	if kind == "" {
		kind = "boba"
	}
	return ps.simpleAction(ctx, s, i, "feed", func(p *PetState, now time.Time) actionResult {
		return p.Feed(kind, now)
	})
}

// HandlePlay implements /play.
func (ps *PetService) HandlePlay(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return ps.simpleAction(ctx, s, i, "play", func(p *PetState, now time.Time) actionResult {
		return p.Play(now)
	})
}

// HandleClean implements /clean.
func (ps *PetService) HandleClean(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return ps.simpleAction(ctx, s, i, "clean", func(p *PetState, now time.Time) actionResult {
		return p.Clean(now)
	})
}

// HandleRest implements /rest.
func (ps *PetService) HandleRest(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return ps.simpleAction(ctx, s, i, "rest", func(p *PetState, now time.Time) actionResult {
		return p.Rest(now)
	})
}

// simpleAction is the shared flow for feed/play/clean/rest: lock, load, decay,
// apply the mutation, persist, credit the caretaker, and render the status card
// with the action's flavor line on top.
func (ps *PetService) simpleAction(
	ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate,
	name string, mutate func(*PetState, time.Time) actionResult,
) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()
	userID, username := interactionUser(i)

	mu := ps.lockGuild(guildID)
	mu.Lock()
	pet, res, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("Alex isn't responding rn, try again"), nil)
	}
	result := mutate(pet, now)
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn(name+" save failed", "guild", guildID, "error", err)
	}
	mood := pet.mood()
	snap := *pet
	mu.Unlock()

	if result.OK {
		ps.creditCaretaker(ctx, guildID, userID, username, result.Care)
	}

	embed := ps.statusEmbed(&snap, mood, now, res)
	embed.Description = result.Message + "\n\n" + embed.Description

	var files []*discordgo.File
	if img, ok := ps.imager.cached(&snap, mood, now); ok {
		embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
		files = append(files, imageFile(img))
	}
	return ps.editEmbed(s, i, embed, files)
}

// HandleShow implements /show — generate (or reuse) an xAI picture of Alex's
// current look. Runs the paid image call OUTSIDE the guild lock.
func (ps *PetService) HandleShow(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()

	mu := ps.lockGuild(guildID)
	mu.Lock()
	pet, res, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("couldn't find Alex rn"), nil)
	}
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("show save failed", "guild", guildID, "error", err)
	}
	mood := pet.mood()
	snap := *pet
	mu.Unlock()

	embed := ps.statusEmbed(&snap, mood, now, res)

	// Serve from cache instantly; otherwise respect the per-guild cooldown before
	// spending an xAI image.
	if img, cached := ps.imager.cached(&snap, mood, now); cached {
		embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
		return ps.editEmbed(s, i, embed, []*discordgo.File{imageFile(img)})
	}
	if ps.onCooldown(guildID, "show", showCooldown, now) {
		embed.Description = "📸 Alex just took a pic — give him a sec before the next one!\n\n" + embed.Description
		return ps.editEmbed(s, i, embed, nil)
	}

	img, err := ps.imager.generate(ctx, &snap, mood, now)
	if err != nil {
		ps.logger.Warn("alex image generate failed", "guild", guildID, "error", err)
		embed.Description = "📸 couldn't snap a pic rn (camera's actin up) — here's how Alex is doin tho:\n\n" + embed.Description
		return ps.editEmbed(s, i, embed, nil)
	}
	embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
	return ps.editEmbed(s, i, embed, []*discordgo.File{imageFile(img)})
}

// HandleRevive implements /revive — bring a dead Alex back as a newborn (new gen).
func (ps *PetService) HandleRevive(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()

	mu := ps.lockGuild(guildID)
	mu.Lock()
	pet, _, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("revive failed, try again"), nil)
	}
	if pet.Alive {
		snap := *pet
		mood := pet.mood()
		mu.Unlock()
		embed := ps.statusEmbed(&snap, mood, now, decayResult{})
		embed.Description = "Alex is alive and well — no need to revive 😎\n\n" + embed.Description
		return ps.editEmbed(s, i, embed, nil)
	}
	pet.revive(now)
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("revive save failed", "guild", guildID, "error", err)
	}
	snap := *pet
	mood := pet.mood()
	mu.Unlock()

	embed := ps.statusEmbed(&snap, mood, now, decayResult{})
	embed.Description = fmt.Sprintf("✨ **Alex is reborn!** Welcome back to the world, lil guy (generation %d) 🍼\nTake better care this time fr 🙏\n\n", snap.Generation) + embed.Description
	return ps.editEmbed(s, i, embed, nil)
}

// HandleRename implements /rename.
func (ps *PetService) HandleRename(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate, name string) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	clean := sanitizePetName(name)
	if clean == "" {
		return respondText(s, i, "that name ain't gonna work 😅 — try 1–32 regular characters.")
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()

	mu := ps.lockGuild(guildID)
	mu.Lock()
	pet, res, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("rename failed, try again"), nil)
	}
	old := pet.Name
	pet.Name = clean
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("rename save failed", "guild", guildID, "error", err)
	}
	snap := *pet
	mood := pet.mood()
	mu.Unlock()

	embed := ps.statusEmbed(&snap, mood, now, res)
	embed.Description = fmt.Sprintf("📝 %s goes by **%s** now — \"new name who dis 😎\"\n\n", old, clean) + embed.Description
	return ps.editEmbed(s, i, embed, nil)
}

// HandleCaretakers implements /caretakers — the leaderboard.
func (ps *PetService) HandleCaretakers(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	rows, err := ps.repo.topCaretakers(ctx, guildID, 10)
	if err != nil {
		return ps.editEmbed(s, i, errEmbed("couldn't load the leaderboard rn"), nil)
	}
	embed := &discordgo.MessageEmbed{
		Title: "🏆 Alex's Top Caretakers",
		Color: 0xf59e0b,
	}
	if len(rows) == 0 {
		embed.Description = "nobody's taken care of Alex yet 👀 — be the first with `/feed`!"
		return ps.editEmbed(s, i, embed, nil)
	}
	medals := []string{"🥇", "🥈", "🥉"}
	var b strings.Builder
	for idx, c := range rows {
		rank := "`#" + itoa(idx+1) + "`"
		if idx < len(medals) {
			rank = medals[idx]
		}
		fmt.Fprintf(&b, "%s **%s** — %d pts  ·  🍽️%d 🎮%d 🧼%d 😴%d 💬%d\n",
			rank, c.Username, c.Points, c.Feeds, c.Plays, c.Cleans, c.Naps, c.Talks)
	}
	embed.Description = b.String()
	embed.Footer = &discordgo.MessageEmbedFooter{Text: "Keep Alex thriving to climb the ranks 🧋"}
	return ps.editEmbed(s, i, embed, nil)
}

// ─── Chat integration hooks (used by chat.go) ───────────────────────────

// StatusLineForChat returns a short, live status line to inject (ephemerally)
// into the /chat system prompt so Alex's replies reflect how he's actually doing.
// Empty string means "no pet context" (DM, no DB, etc.).
func (ps *PetService) StatusLineForChat(ctx context.Context, guildID string) string {
	if guildID == "" || ps == nil {
		return ""
	}
	now := time.Now().UTC()
	mu := ps.lockGuild(guildID)
	mu.Lock()
	defer mu.Unlock()
	pet, ok, err := ps.repo.load(ctx, guildID)
	if err != nil || !ok {
		return ""
	}
	pet.applyDecay(now)
	mood := pet.mood()
	if !pet.Alive {
		return "\n\nCURRENT STATE: You (Alex) are currently passed out / not well and waiting to be revived. Reply weakly, like you're barely hanging on but still you."
	}
	return fmt.Sprintf(
		"\n\nCURRENT STATE (let this subtly color your reply, don't recite the numbers): "+
			"you're a %s right now, vibe: %s. Hunger %d/100, Energy %d/100, Hygiene %d/100, Happiness %d/100, Health %d/100. "+
			"If a stat is low, naturally hint at needing it (e.g. hungry → crave boba/food; sleepy → tired; sad → want company).",
		stageWord(pet.LifeStage), mood.Label,
		int(pet.Hunger), int(pet.Energy), int(pet.Hygiene), int(pet.Happiness), int(pet.Health),
	)
}

// RecordChat stamps the channel/talk activity from a /chat interaction so the
// care loop knows where to talk and the caretaker leaderboard counts chats.
func (ps *PetService) RecordChat(ctx context.Context, guildID, channelID, userID, username string) {
	if guildID == "" || ps == nil {
		return
	}
	now := time.Now().UTC()
	mu := ps.lockGuild(guildID)
	mu.Lock()
	pet, _, err := ps.loadDecay(ctx, guildID, channelID, now)
	if err != nil {
		mu.Unlock()
		return
	}
	t := now
	pet.LastChatAt = &t
	if pet.Alive {
		pet.Happiness = clampStat(pet.Happiness + 4) // company cheers Alex up a little
	}
	_ = ps.repo.save(ctx, pet)
	mu.Unlock()
	ps.creditCaretaker(ctx, guildID, userID, username, "talks")
}

// ─── Rendering ──────────────────────────────────────────────────────────

// statusEmbed renders the stat card. `res` lets a fresh growth/death (detected on
// load) be surfaced inline.
func (ps *PetService) statusEmbed(p *PetState, mood Mood, now time.Time, res decayResult) *discordgo.MessageEmbed {
	color := 0x34d399 // green
	switch {
	case !p.Alive:
		color = 0x6b7280 // gray
	case p.Health < 25 || len(p.needs()) > 0:
		color = 0xef4444 // red
	case mood.Key == "chillin":
		color = 0xa855f7 // purple
	}

	var desc strings.Builder
	if res.Died {
		desc.WriteString("💀 **Alex passed out from neglect...** he needs a `/revive`. RIP the grind 🥀\n\n")
	} else if res.GrewUp {
		fmt.Fprintf(&desc, "🎉 **Alex grew up into a %s!** they grow up so fast 🥹\n\n", stageWord(res.StageAfter))
	}
	fmt.Fprintf(&desc, "**%s** · %s · gen %d\n_%s %s_",
		p.Name, stageLabel[p.LifeStage], p.Generation, mood.Emoji, mood.Label)

	embed := &discordgo.MessageEmbed{
		Title:       "🧋 " + p.Name + " the Alex",
		Color:       color,
		Description: desc.String(),
		Fields: []*discordgo.MessageEmbedField{
			{Name: "🍽️ Hunger", Value: statBar(p.Hunger), Inline: true},
			{Name: "😊 Happiness", Value: statBar(p.Happiness), Inline: true},
			{Name: "⚡ Energy", Value: statBar(p.Energy), Inline: true},
			{Name: "🧼 Hygiene", Value: statBar(p.Hygiene), Inline: true},
			{Name: "❤️ Health", Value: statBar(p.Health), Inline: true},
			{Name: "🎂 Age", Value: p.ageString(now), Inline: true},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: "/feed · /play · /clean · /rest · /show · /chat"},
	}
	return embed
}

// statBar renders a 0–100 stat as a 10-segment bar plus the number.
func statBar(v float64) string {
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	filled := int((v + 5) / 10) // round to nearest segment
	if filled > 10 {
		filled = 10
	}
	return strings.Repeat("█", filled) + strings.Repeat("░", 10-filled) + " " + itoa(int(v)) + "/100"
}

func errEmbed(msg string) *discordgo.MessageEmbed {
	return &discordgo.MessageEmbed{
		Color:       0xef4444,
		Title:       "❌ bruh something broke",
		Description: msg,
	}
}

// imageFile wraps generated bytes as a Discord file attachment.
func imageFile(img *alexImage) *discordgo.File {
	return &discordgo.File{
		Name:        img.Filename,
		ContentType: contentTypeForExt(img.Ext),
		Reader:      bytes.NewReader(img.Bytes),
	}
}

func contentTypeForExt(ext string) string {
	switch ext {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	default:
		return "application/octet-stream"
	}
}

// stageWord is the bare stage noun for prose ("infant", "kid", ...).
func stageWord(st LifeStage) string {
	switch st {
	case StageInfant:
		return "infant"
	case StageToddler:
		return "toddler"
	case StageChild:
		return "kid"
	case StageTeen:
		return "teenager"
	case StageAdult:
		return "grown adult"
	default:
		return "lil guy"
	}
}

// sanitizePetName trims and bounds a user-supplied name: printable characters
// only, 1–32 runes, no @/# mention or backtick injection.
func sanitizePetName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.NewReplacer("@", "", "#", "", "`", "", "\n", " ", "\r", " ").Replace(name)
	name = strings.TrimSpace(name)
	r := []rune(name)
	if len(r) == 0 {
		return ""
	}
	if len(r) > 32 {
		r = r[:32]
	}
	return strings.TrimSpace(string(r))
}
