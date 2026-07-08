// pet_service.go orchestrates the Alex tamagotchi: it turns slash commands into
// state mutations, renders the status/embed cards, generates the xAI selfie for
// /show, and maintains the caretaker leaderboard. It also holds the discordgo
// session used by the background caretaking loop (pet_care.go).
//
// There is ONE global Alex shared across every server. Every mutation goes
// through lockGuild(globalPetKey) → load → applyDecay → mutate → save, so
// simultaneous commands from any server can't race the read-modify-write cycle.
// The one exception (xAI image generation for /show) deliberately runs OUTSIDE
// the lock on a snapshot, so a 60s image call never blocks other caretakers.
// Per-guild data (last channel, intro flag) lives in discord_alex_guild.
package discordbot

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// PetService is the tamagotchi command surface.
type PetService struct {
	repo     *petRepo
	imager   *alexImager
	deepseek *DeepSeekClient // for AI-generated proactive messages (optional)
	logger   *log.Logger

	// imageBaseURL is the base URL of the web app that renders the /caretakers
	// leaderboard PNG (ALEX_PUBLIC_BASE_URL). Empty disables the image (text only).
	imageBaseURL string
	http         *http.Client

	mu         sync.Mutex
	guildLocks map[string]*sync.Mutex
	cooldowns  map[string]time.Time // key "guildId:action" -> last run

	sessMu  sync.RWMutex
	session *discordgo.Session // set once the gateway is open (for the care loop)
}

// NewPetService wires the tamagotchi. imageBaseURL is the web app base URL used to
// render the /caretakers leaderboard image (empty => text-only leaderboard).
// deepseek is optional; when set, Alex's proactive messages are AI-generated.
func NewPetService(repo *petRepo, imager *alexImager, deepseek *DeepSeekClient, logger *log.Logger, imageBaseURL string) *PetService {
	return &PetService{
		repo:         repo,
		imager:       imager,
		deepseek:     deepseek,
		logger:       logger,
		imageBaseURL: strings.TrimRight(imageBaseURL, "/"),
		http:         &http.Client{Timeout: 10 * time.Second},
		guildLocks:   make(map[string]*sync.Mutex),
		cooldowns:    make(map[string]time.Time),
	}
}

// carePoints weights each care action for the leaderboard.
var carePoints = map[string]int{"feeds": 10, "plays": 8, "cleans": 6, "naps": 5, "talks": 3, "studies": 9}

// showCooldown bounds how often a guild can spend an xAI image on /show.
const showCooldown = 45 * time.Second

// ─── Locking & cooldowns ────────────────────────────────────────────────

// lockGuild returns the mutex for a key. The key is globalPetKey for all pet
// mutations (one global Alex) and a real guild id for per-guild intro handling.
func (ps *PetService) lockGuild(key string) *sync.Mutex {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	m, ok := ps.guildLocks[key]
	if !ok {
		m = &sync.Mutex{}
		ps.guildLocks[key] = m
	}
	return m
}

// onCooldown reports whether action is still cooling down for a key, and if not,
// stamps it as used now.
func (ps *PetService) onCooldown(key, action string, d time.Duration, now time.Time) bool {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	key = key + ":" + action
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

// loadDecay loads (or creates) the single global Alex, applies time decay, and
// records which channel this guild last used a command in (so Alex can broadcast
// back there). The caller MUST hold the global pet lock. Returns the pet and the
// decay transitions (grew up / died) so the handler can note them.
func (ps *PetService) loadDecay(ctx context.Context, guildID, channelID string, now time.Time) (*PetState, decayResult, error) {
	pet, ok, err := ps.repo.load(ctx, globalPetKey)
	if err != nil {
		return nil, decayResult{}, err
	}
	if !ok {
		pet = newPet(globalPetKey, now)
	}
	res := pet.applyDecay(now)
	pet.LastInteractionAt = now
	// Remember where this guild last interacted so the care loop can talk back
	// there (best-effort; a separate per-guild table, decoupled from the pet).
	if guildID != "" && channelID != "" {
		if e := ps.repo.recordGuildChannel(ctx, guildID, channelID); e != nil {
			ps.logger.Warn("record guild channel failed", "guild", guildID, "error", e)
		}
	}
	return pet, res, nil
}

// creditCaretaker records a caretaker's action for the global leaderboard
// (best-effort). A user's caretaking counts once, globally, no matter which
// server they did it in. avatarHash is stored so the leaderboard image can show
// their face.
func (ps *PetService) creditCaretaker(ctx context.Context, userID, username, avatarHash, care string) {
	if care == "" {
		return
	}
	pts := carePoints[care]
	if err := ps.repo.bumpCaretaker(ctx, globalPetKey, userID, username, avatarHash, care, pts); err != nil {
		ps.logger.Warn("caretaker credit failed", "user", userID, "error", err)
	}
}

// ─── Guard + response helpers ───────────────────────────────────────────

// requireGuild rejects DM usage: Alex is one global pet, but commands must run in
// a server so we know which channel to remember for his broadcasts.
func requireGuild(s *discordgo.Session, i *discordgo.InteractionCreate) (string, bool) {
	if i.GuildID == "" {
		_ = respondText(s, i, "Alex hangs out in servers, not DMs 🏠 — use these commands in a server channel.")
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
	_, username := interactionUser(i)

	mu := ps.lockGuild(globalPetKey)
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
	embed.Footer = attributeFooter(username, "👀", "checked on Alex")

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

// HandleStudy implements /study — build Alex's intelligence toward a career.
func (ps *PetService) HandleStudy(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	return ps.simpleAction(ctx, s, i, "study", func(p *PetState, now time.Time) actionResult {
		return p.Study(now)
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

	mu := ps.lockGuild(globalPetKey)
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
		ps.creditCaretaker(ctx, userID, username, interactionAvatar(i), result.Care)
		ps.refreshPresence(&snap) // reflect the new state in the bot's status
	}

	embed := ps.statusEmbed(&snap, mood, now, res)
	embed.Description = result.Message + "\n\n" + embed.Description
	if result.OK {
		// Attribute the action so the whole server sees who's caring for Alex.
		embed.Footer = attributeFooter(username, "🫶", "looked after Alex")
	}

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
	_, username := interactionUser(i)

	mu := ps.lockGuild(globalPetKey)
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
	embed.Footer = attributeFooter(username, "📸", "snapped a pic of Alex")

	// Serve from cache instantly; otherwise respect the per-guild cooldown before
	// spending an xAI image.
	if img, cached := ps.imager.cached(&snap, mood, now); cached {
		embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
		return ps.editEmbed(s, i, embed, []*discordgo.File{imageFile(img)})
	}
	if ps.onCooldown(globalPetKey, "show", showCooldown, now) {
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
	_, username := interactionUser(i)

	mu := ps.lockGuild(globalPetKey)
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
		hint := "Alex is alive and well — no need to revive 😎"
		if snap.canGraduate() {
			hint += "\nHe's a grown adult now though — use `/newlife` to start a New Game+ 🎓"
		}
		embed.Description = hint + "\n\n" + embed.Description
		embed.Footer = attributeFooter(username, "👀", "checked on Alex")
		return ps.editEmbed(s, i, embed, nil)
	}
	pet.startNewLife(now)
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("revive save failed", "guild", guildID, "error", err)
	}
	snap := *pet
	mood := pet.mood()
	mu.Unlock()

	ps.refreshPresence(&snap) // he's alive again — update the status

	embed := ps.statusEmbed(&snap, mood, now, decayResult{})
	embed.Description = fmt.Sprintf("✨ **Alex is reborn!** Welcome back to the world, lil guy (generation %d) 🍼\n%s\nTake better care this time fr 🙏\n\n", snap.Generation, legacyNote(snap.Intelligence)) + embed.Description
	embed.Footer = attributeFooter(username, "✨", "revived Alex")
	return ps.editEmbed(s, i, embed, nil)
}

// HandleNewLife implements /newlife — voluntary New Game+ once Alex is a grown
// adult: he "graduates" and a fresh gen-N+1 infant begins, inheriting a legacy
// intelligence head-start from the life that just ended.
func (ps *PetService) HandleNewLife(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()
	_, username := interactionUser(i)

	mu := ps.lockGuild(globalPetKey)
	mu.Lock()
	pet, _, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("couldn't start a new life rn, try again"), nil)
	}
	if !pet.canGraduate() {
		snap := *pet
		mood := pet.mood()
		mu.Unlock()
		embed := ps.statusEmbed(&snap, mood, now, decayResult{})
		reason := "Alex has to grow all the way up to an **Adult** before he can start a New Game+ 🎓"
		if !snap.Alive {
			reason = "Alex has passed out 💀 — use `/revive` to bring him back instead."
		}
		embed.Description = reason + "\n\n" + embed.Description
		embed.Footer = attributeFooter(username, "👀", "checked on Alex")
		return ps.editEmbed(s, i, embed, nil)
	}
	prevGen := pet.Generation
	prevCareer := careerDisplay(pet.Career)
	pet.startNewLife(now)
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("newlife save failed", "guild", guildID, "error", err)
	}
	snap := *pet
	mood := pet.mood()
	mu.Unlock()

	ps.refreshPresence(&snap) // fresh newborn — update the status

	embed := ps.statusEmbed(&snap, mood, now, decayResult{})
	embed.Description = fmt.Sprintf(
		"🎓 **Alex graduated and started a whole new life!**\nGen %d (%s) lived a full life — say hi to **generation %d** 🍼\n%s\n\n",
		prevGen, prevCareer, snap.Generation, legacyNote(snap.Intelligence),
	) + embed.Description
	embed.Footer = attributeFooter(username, "🎓", "started Alex's new life")
	return ps.editEmbed(s, i, embed, nil)
}

// HandleCareer implements /career — set (or view) Alex's career aspiration.
func (ps *PetService) HandleCareer(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate, path string) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	now := time.Now().UTC()
	_, username := interactionUser(i)

	mu := ps.lockGuild(globalPetKey)
	mu.Lock()
	pet, res, err := ps.loadDecay(ctx, guildID, i.ChannelID, now)
	if err != nil {
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("couldn't set Alex's career rn"), nil)
	}

	var note string
	footerVerb := "checked Alex's career"
	footerEmoji := "👀"
	switch {
	case path == "":
		// No path given → just report the current aspiration + options.
		note = "Alex is currently going for: **" + careerDisplay(pet.Career) + "**\n" + careerOptionsLine()
	case !validCareer(path):
		mu.Unlock()
		return ps.editEmbed(s, i, errEmbed("that's not a career Alex knows about 😅\n"+careerOptionsLine()), nil)
	case !pet.Alive:
		note = "Alex can't chase a career while he's passed out 💀 — `/revive` him first."
	default:
		pet.Career = path
		if pet.Happiness < 100 {
			pet.Happiness = clampStat(pet.Happiness + 6) // having a dream cheers him up
		}
		note = "Alex is now chasing **" + careerDisplay(path) + "** — " + careerBlurb[path] + "\nKeep him `/study`-ing to make it happen 📚"
		footerVerb = "set Alex's dream job"
		footerEmoji = "🎯"
	}

	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("career save failed", "guild", guildID, "error", err)
	}
	snap := *pet
	mood := pet.mood()
	mu.Unlock()

	embed := ps.statusEmbed(&snap, mood, now, res)
	embed.Description = note + "\n\n" + embed.Description
	embed.Footer = attributeFooter(username, footerEmoji, footerVerb)
	return ps.editEmbed(s, i, embed, nil)
}

// legacyNote describes the New Game+ intelligence head-start (or lack of one).
func legacyNote(intelligence float64) string {
	if intelligence <= 0 {
		return "🧠 Fresh start — no legacy knowledge to inherit yet."
	}
	return fmt.Sprintf("🧠 Legacy bonus: born with **%d** intelligence from his past life's studies.", int(intelligence))
}

// careerOptionsLine lists the pickable careers for /career.
func careerOptionsLine() string {
	var parts []string
	for _, key := range careerOrder {
		parts = append(parts, "`"+key+"` "+careerLabel[key])
	}
	return "Options: " + strings.Join(parts, "  ·  ")
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
	_, username := interactionUser(i)

	mu := ps.lockGuild(globalPetKey)
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
	embed.Footer = attributeFooter(username, "📝", "renamed Alex")
	return ps.editEmbed(s, i, embed, nil)
}

// HandleCaretakers implements /caretakers — the global leaderboard. It tries a
// rendered image (avatars + ranked table) first and falls back to a text table
// on any failure.
func (ps *PetService) HandleCaretakers(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate) error {
	if _, ok := requireGuild(s, i); !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	_, username := interactionUser(i)
	rows, err := ps.repo.topCaretakers(ctx, globalPetKey, 10)
	if err != nil {
		return ps.editEmbed(s, i, errEmbed("couldn't load the leaderboard rn"), nil)
	}
	if len(rows) == 0 {
		embed := &discordgo.MessageEmbed{
			Title:       "🏆 Alex's Top Caretakers",
			Color:       0xf59e0b,
			Description: "nobody's taken care of Alex yet 👀 — be the first with `/feed`!",
			Footer:      attributeFooter(username, "🏆", "pulled up the leaderboard"),
		}
		return ps.editEmbed(s, i, embed, nil)
	}

	// Refresh the displayed caretakers' avatars so the image shows current faces
	// (rows created before avatarHash was captured, or since changed). Throttled —
	// s.User hits the API, and stored hashes are also kept fresh on every action.
	if !ps.onCooldown(globalPetKey, "avatar_refresh", 5*time.Minute, time.Now().UTC()) {
		ps.refreshCaretakerAvatars(ctx, s, rows)
	}

	// Preferred: the rendered leaderboard image (avatars + ranked table).
	if png, err := ps.fetchCaretakersImage(ctx); err == nil && len(png) > 0 {
		embed := &discordgo.MessageEmbed{
			Title:  "🏆 Alex's Top Caretakers",
			Color:  0xf59e0b,
			Image:  &discordgo.MessageEmbedImage{URL: "attachment://caretakers.png"},
			Footer: attributeFooter(username, "🏆", "pulled up the leaderboard"),
		}
		return ps.editEmbed(s, i, embed, []*discordgo.File{{
			Name:        "caretakers.png",
			ContentType: "image/png",
			Reader:      bytes.NewReader(png),
		}})
	} else if err != nil {
		ps.logger.Warn("caretakers image unavailable, using text", "error", err)
	}

	// Fallback: a text table.
	return ps.editEmbed(s, i, caretakersTextEmbed(rows, username), nil)
}

// caretakersTextEmbed renders the leaderboard as a text embed (the fallback when
// the rendered image is unavailable).
func caretakersTextEmbed(rows []CaretakerRow, username string) *discordgo.MessageEmbed {
	medals := []string{"🥇", "🥈", "🥉"}
	var b strings.Builder
	for idx, c := range rows {
		rank := "`#" + itoa(idx+1) + "`"
		if idx < len(medals) {
			rank = medals[idx]
		}
		fmt.Fprintf(&b, "%s **%s** — %d pts  ·  🍽️%d 🎮%d 🧼%d 😴%d 💬%d 📚%d\n",
			rank, c.Username, c.Points, c.Feeds, c.Plays, c.Cleans, c.Naps, c.Talks, c.Studies)
	}
	return &discordgo.MessageEmbed{
		Title:       "🏆 Alex's Top Caretakers",
		Color:       0xf59e0b,
		Description: b.String(),
		Footer:      attributeFooter(username, "🏆", "pulled up the leaderboard"),
	}
}

// refreshCaretakerAvatars resolves each displayed caretaker's current Discord
// avatar and updates the DB, so the leaderboard image shows up-to-date faces even
// for rows created before their avatar was captured. Best-effort and time-bounded;
// avatars discordgo already has cached don't hit the API.
func (ps *PetService) refreshCaretakerAvatars(ctx context.Context, s *discordgo.Session, rows []CaretakerRow) {
	if s == nil || len(rows) == 0 {
		return
	}
	var wg sync.WaitGroup
	for _, r := range rows {
		userID := r.UserID
		wg.Add(1)
		go func() {
			defer wg.Done()
			u, err := s.User(userID)
			if err != nil || u == nil {
				return
			}
			if e := ps.repo.setCaretakerAvatar(ctx, globalPetKey, userID, u.Avatar); e != nil {
				ps.logger.Warn("caretaker avatar refresh failed", "user", userID, "error", e)
			}
		}()
	}
	// Bound the total wait so /caretakers stays responsive even if Discord is slow.
	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
	}
}

// fetchCaretakersImage fetches the rendered leaderboard PNG from the web app.
// Returns (nil, nil) when no base URL is configured (image disabled); an error
// otherwise so the caller falls back to text.
func (ps *PetService) fetchCaretakersImage(ctx context.Context) ([]byte, error) {
	if ps.imageBaseURL == "" {
		return nil, nil
	}
	reqCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, ps.imageBaseURL+"/api/discord/activity-image?type=caretakers", nil)
	if err != nil {
		return nil, err
	}
	resp, err := ps.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("caretakers image HTTP %d", resp.StatusCode)
	}
	png, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, err
	}
	if detectAlexImageExt(png) != ".png" {
		return nil, fmt.Errorf("caretakers image: not a PNG")
	}
	return png, nil
}

// messageLevelBlurb describes what each /alexmessages level does.
var messageLevelBlurb = map[string]struct {
	color int
	title string
	desc  string
}{
	msgLevelAll: {0x34d399, "🔔 Alex's messages: ALL",
		"Alex will send **everything** here — his random slice-of-life posts, care alerts when he needs something, and big life events."},
	msgLevelCare: {0xf59e0b, "🩹 Alex's messages: CARE ONLY",
		"Alex will only ping here when he **genuinely needs care** or hits a **life event** (growing up, passing out). No random chatter."},
	msgLevelOff: {0x6b7280, "🔕 Alex's messages: SILENT",
		"Alex will be **completely silent** in this server — no proactive messages at all. Commands still work; he just won't message on his own."},
}

// HandleSetMessages implements /alexmessages — set this server's proactive-message
// level. level is "all", "care", "off", or "" (report the current setting).
// Permission is enforced by the caller (bot owner or Manage Messages).
func (ps *PetService) HandleSetMessages(ctx context.Context, s *discordgo.Session, i *discordgo.InteractionCreate, level string) error {
	guildID, ok := requireGuild(s, i)
	if !ok {
		return nil
	}
	if err := deferReply(s, i); err != nil {
		return err
	}
	_, username := interactionUser(i)

	// No level given → report the current setting + the options.
	if level == "" {
		current, err := ps.repo.guildMessageLevel(ctx, guildID)
		if err != nil {
			return ps.editEmbed(s, i, errEmbed("couldn't read Alex's settings rn"), nil)
		}
		info := messageLevelBlurb[current]
		if info.title == "" {
			info = messageLevelBlurb[msgLevelAll]
		}
		embed := &discordgo.MessageEmbed{
			Color:       info.color,
			Title:       "⚙️ Alex's messages here: currently **" + strings.ToUpper(current) + "**",
			Description: info.desc + "\n\nChange it with `/alexmessages` → `all` · `care` · `off`.",
			Footer:      attributeFooter(username, "👀", "checked Alex's message settings"),
		}
		return ps.editEmbed(s, i, embed, nil)
	}

	if _, valid := messageLevelBlurb[level]; !valid {
		return ps.editEmbed(s, i, errEmbed("unknown setting — pick `all`, `care`, or `off`."), nil)
	}
	if err := ps.repo.setGuildMessageLevel(ctx, guildID, i.ChannelID, level); err != nil {
		return ps.editEmbed(s, i, errEmbed("couldn't update Alex's settings rn"), nil)
	}

	info := messageLevelBlurb[level]
	embed := &discordgo.MessageEmbed{
		Color:       info.color,
		Title:       info.title,
		Description: info.desc,
		Footer:      attributeFooter(username, "⚙️", "changed Alex's messages here"),
	}
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
	mu := ps.lockGuild(globalPetKey)
	mu.Lock()
	defer mu.Unlock()
	pet, ok, err := ps.repo.load(ctx, globalPetKey)
	if err != nil || !ok {
		return ""
	}
	pet.applyDecay(now)
	mood := pet.mood()
	if !pet.Alive {
		return "\n\nCURRENT STATE: You (Alex) are currently passed out / not well and waiting to be revived. Reply weakly, like you're barely hanging on but still you."
	}
	career := "still figuring out what you wanna be"
	if l, ok := careerLabel[pet.Career]; ok {
		career = "chasing a career as a " + l
	}
	return fmt.Sprintf(
		"\n\nCURRENT STATE (let this subtly color your reply, don't recite the numbers): "+
			"you're a %s right now, vibe: %s, and you're %s (intelligence %d/100). "+
			"Hunger %d/100, Energy %d/100, Hygiene %d/100, Happiness %d/100, Health %d/100. "+
			"If a stat is low, naturally hint at needing it (e.g. hungry → crave boba/food; sleepy → tired; sad → want company). "+
			"Let your career dream come through in how you talk.",
		stageWord(pet.LifeStage), mood.Label, career, int(pet.Intelligence),
		int(pet.Hunger), int(pet.Energy), int(pet.Hygiene), int(pet.Happiness), int(pet.Health),
	)
}

// NoteMentioned records that Alex was @mentioned/replied-to in a channel: it
// remembers the channel (so the care loop talks there) and cheers Alex up a
// little. No leaderboard credit — mentions must not be farmable for points.
func (ps *PetService) NoteMentioned(ctx context.Context, guildID, channelID string) {
	if guildID == "" || ps == nil {
		return
	}
	now := time.Now().UTC()
	mu := ps.lockGuild(globalPetKey)
	mu.Lock()
	defer mu.Unlock()
	pet, _, err := ps.loadDecay(ctx, guildID, channelID, now)
	if err != nil {
		return
	}
	if pet.Alive {
		pet.Happiness = clampStat(pet.Happiness + 2)
	}
	_ = ps.repo.save(ctx, pet)
}

// RecordChat stamps the channel/talk activity from a /chat interaction so the
// care loop knows where to talk and the caretaker leaderboard counts chats.
func (ps *PetService) RecordChat(ctx context.Context, guildID, channelID, userID, username, avatarHash string) {
	if guildID == "" || ps == nil {
		return
	}
	now := time.Now().UTC()
	mu := ps.lockGuild(globalPetKey)
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
	ps.creditCaretaker(ctx, userID, username, avatarHash, "talks")
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
	fmt.Fprintf(&desc, "**%s** · %s · gen %d\n_%s %s_\n🎯 Dream: %s · 🧠 %s",
		p.Name, stageLabel[p.LifeStage], p.Generation, mood.Emoji, mood.Label,
		careerDisplay(p.Career), intelligenceLabel(p.Intelligence))

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
			{Name: "🧠 Intelligence", Value: statBar(p.Intelligence), Inline: true},
			{Name: "🎂 Age", Value: p.ageString(now), Inline: true},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: "/feed · /play · /clean · /rest · /study · /show · /chat"},
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

// attributeFooter names the user who ran a command and what they did, so every
// public embed makes clear who's interacting with Alex (visible in scrollback,
// beyond Discord's transient "used /command" header).
func attributeFooter(username, emoji, verb string) *discordgo.MessageEmbedFooter {
	return &discordgo.MessageEmbedFooter{Text: emoji + " " + username + " " + verb}
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
