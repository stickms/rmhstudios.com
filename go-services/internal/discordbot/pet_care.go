// pet_care.go is the background heartbeat that makes Alex feel alive even when
// nobody's running a command. On a ticker it walks every guild's pet, advances
// its stats, and — into the last channel a command was used in — posts at most
// one proactive message per pet per tick, chosen by priority:
//
//  1. Life events: Alex grew into a new stage, or passed out from neglect.
//  2. Care alerts: a stat is critically low (throttled so it never spams).
//  3. Ambient life: a fun "Alex says: I'm out getting boba!" slice-of-life post.
//
// All Discord sends are best-effort; if the saved channel is gone or the bot
// lost access there, we clear it so we stop hammering a dead channel.
package discordbot

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/config"
)

// Tunables (env-overridable).
func careTickInterval() time.Duration {
	return config.GetDuration("ALEX_TICK_INTERVAL", 10*time.Minute)
}
func careAlertInterval() time.Duration {
	return config.GetDuration("ALEX_CARE_ALERT_INTERVAL", 45*time.Minute)
}
func ambientMinInterval() time.Duration {
	return config.GetDuration("ALEX_AMBIENT_INTERVAL", 3*time.Hour)
}

const ambientJitter = 3 * time.Hour // added randomly on top of the min interval

// StartCareLoop records the session and launches the background loop. It returns
// immediately; the loop stops when ctx is cancelled. Safe to call once (the bot
// calls it after the gateway opens).
func (ps *PetService) StartCareLoop(ctx context.Context, s *discordgo.Session) {
	ps.setSession(s)
	go ps.careLoop(ctx)
}

func (ps *PetService) careLoop(ctx context.Context) {
	interval := careTickInterval()
	ps.logger.Info("alex care loop started", "interval", interval.String())

	// Small initial delay so the gateway is fully settled before the first tick.
	select {
	case <-ctx.Done():
		return
	case <-time.After(30 * time.Second):
	}
	ps.careTick(ctx)

	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			ps.logger.Info("alex care loop stopped")
			return
		case <-t.C:
			ps.careTick(ctx)
		}
	}
}

// proactiveKind is what (if anything) to post for a pet this tick.
type proactiveKind int

const (
	kindNone proactiveKind = iota
	kindGrewUp
	kindDied
	kindCareAlert
	kindAmbient
)

// plan carries the decision made under the global lock out to the (unlocked)
// broadcast.
type plan struct {
	kind   proactiveKind
	pet    PetState
	mood   Mood
	need   string // for kindCareAlert
	loaded bool   // pet was successfully loaded (pet/mood are valid)
}

// wantsMessage reports whether a server at the given /alexmessages level should
// receive a proactive message of the given kind. "care" drops only random ambient
// posts; "off" drops everything; anything else ("all") gets it.
func wantsMessage(level string, kind proactiveKind) bool {
	switch level {
	case msgLevelOff:
		return false
	case msgLevelCare:
		return kind != kindAmbient
	default:
		return true
	}
}

// careTick advances the global Alex once, refreshes the bot's Discord presence to
// reflect his state, and broadcasts any proactive message to every server's
// last-used channel.
func (ps *PetService) careTick(ctx context.Context) {
	s := ps.getSession()
	if s == nil {
		return
	}
	now := time.Now().UTC()

	pl := ps.decideGlobal(ctx, now)
	if pl.loaded {
		ps.updatePresence(s, &pl.pet)
	}
	if pl.kind == kindNone {
		return
	}

	channels, err := ps.repo.allGuildChannels(ctx)
	if err != nil {
		ps.logger.Warn("care tick: load guild channels failed", "error", err)
		return
	}
	if len(channels) == 0 {
		return
	}
	ps.broadcast(ctx, s, pl, channels, now)
}

// decideGlobal locks the global pet, advances it, decides the single proactive
// message to broadcast this tick (updating throttle timestamps + persisting), and
// returns the plan. All state writes happen here under the lock; the broadcast
// happens after. Creates Alex on first tick if he doesn't exist yet, so he starts
// living as soon as the bot does.
func (ps *PetService) decideGlobal(ctx context.Context, now time.Time) plan {
	mu := ps.lockGuild(globalPetKey)
	mu.Lock()
	defer mu.Unlock()

	pet, ok, err := ps.repo.load(ctx, globalPetKey)
	if err != nil {
		ps.logger.Warn("care tick: load pet failed", "error", err)
		return plan{}
	}
	if !ok {
		pet = newPet(globalPetKey, now)
	}
	res := pet.applyDecay(now)

	kind := kindNone
	need := ""
	switch {
	case res.Died:
		kind = kindDied
	case res.GrewUp:
		kind = kindGrewUp
	default:
		if ns := pet.needs(); len(ns) > 0 {
			if dueSince(pet.LastCareAlertAt, careAlertInterval(), now) {
				kind = kindCareAlert
				need = ns[0]
				t := now
				pet.LastCareAlertAt = &t
			}
		} else if pet.Alive && ambientDue(pet.LastAmbientAt, now) {
			kind = kindAmbient
			t := now
			pet.LastAmbientAt = &t
		}
	}

	// Persist decay + any throttle-timestamp updates regardless of send outcome
	// (so a failed broadcast can't cause a re-spam next tick).
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("care tick save failed", "error", err)
	}

	// Always return the loaded pet so the caller can refresh presence even when
	// there's nothing to broadcast this tick.
	return plan{kind: kind, pet: *pet, mood: pet.mood(), need: need, loaded: true}
}

// dueSince reports whether `interval` has elapsed since `last` (nil last = due).
func dueSince(last *time.Time, interval time.Duration, now time.Time) bool {
	return last == nil || now.Sub(*last) >= interval
}

// ambientDue adds random jitter so ambient posts don't fire like clockwork.
func ambientDue(last *time.Time, now time.Time) bool {
	base := ambientMinInterval()
	if last == nil {
		// First ever: stagger the very first ambient post a bit.
		return rand.Intn(3) == 0
	}
	threshold := base + time.Duration(rand.Int63n(int64(ambientJitter)+1))
	return now.Sub(*last) >= threshold
}

// broadcast delivers the planned message to every server's last-used channel
// (outside the global lock). The message is built once — for a grow-up milestone
// the selfie is generated a single time and reused across all sends — and a send
// that fails because the channel is gone/forbidden clears that guild's channel.
func (ps *PetService) broadcast(ctx context.Context, s *discordgo.Session, pl plan, channels []GuildChannel, now time.Time) {
	var content string
	var embeds []*discordgo.MessageEmbed
	var img *alexImage // set for the grow-up milestone; a fresh attachment is made per send

	switch pl.kind {
	case kindDied:
		embeds = []*discordgo.MessageEmbed{{
			Color:       0x6b7280,
			Title:       "💀 RIP Alex (for now)",
			Description: fmt.Sprintf("**%s** passed out from neglect... y'all gotta take better care 🥀\nSomeone run `/revive` to bring him back for a fresh start 🙏", pl.pet.Name),
		}}
	case kindGrewUp:
		embed := &discordgo.MessageEmbed{
			Color:       0x34d399,
			Title:       "🎉 Alex leveled up in life!",
			Description: fmt.Sprintf("**%s** just grew into a **%s**! 🥹 they really do grow up fast...\nsay hi with `/chat` or check on him with `/alex`", pl.pet.Name, stageLabel[pl.pet.LifeStage]),
		}
		embeds = []*discordgo.MessageEmbed{embed}
		// Milestone selfie — generated ONCE (cached), reused across every server.
		if generated, err := ps.imager.generate(ctx, &pl.pet, pl.mood, now); err == nil {
			img = generated
			embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
		}
	case kindCareAlert:
		content = "🧋 **Alex:** " + careAlertLine(pl.need)
	case kindAmbient:
		content = "🧋 **Alex:** " + ambientLine(pl.pet.LifeStage, pl.pet.Career)
	default:
		return
	}

	for _, gc := range channels {
		// Respect each server's /alexmessages level: "all" gets everything, "care"
		// skips random ambient posts, "off" gets nothing.
		if !wantsMessage(gc.MessageLevel, pl.kind) {
			continue
		}
		msg := &discordgo.MessageSend{Content: content, Embeds: embeds}
		if img != nil {
			// A new imageFile per send: each wraps its own reader over the bytes.
			msg.Files = []*discordgo.File{imageFile(img)}
		}
		if _, err := s.ChannelMessageSendComplex(gc.ChannelID, msg); err != nil {
			ps.handleSendError(ctx, gc.GuildID, gc.ChannelID, err)
		}
	}
}

// handleSendError clears a dead/forbidden guild channel so we stop broadcasting
// into a place we can't reach; other errors are just logged.
func (ps *PetService) handleSendError(ctx context.Context, guildID, channelID string, err error) {
	var rerr *discordgo.RESTError
	if errors.As(err, &rerr) && rerr.Message != nil {
		switch rerr.Message.Code {
		case discordgo.ErrCodeUnknownChannel, discordgo.ErrCodeMissingAccess, discordgo.ErrCodeMissingPermissions:
			ps.logger.Info("clearing unreachable alex channel", "guild", guildID, "channel", channelID, "code", rerr.Message.Code)
			if e := ps.repo.clearGuildChannel(ctx, guildID); e != nil {
				ps.logger.Warn("clear guild channel failed", "guild", guildID, "error", e)
			}
			return
		}
	}
	ps.logger.Warn("alex proactive send failed", "guild", guildID, "channel", channelID, "error", err)
}

// ─── Message pools ──────────────────────────────────────────────────────

var careAlertLinesByNeed = map[string][]string{
	"hungry": {
		"yo I'm STARVING fr, somebody `/feed` me a boba before I pass out 🧋😭",
		"deadass haven't eaten in a min... `/feed` me pls, I'm running on empty no cap",
		"my stomach doin backflips rn, need some food ASAP 🍜 `/feed` me!",
	},
	"sleepy": {
		"bro I'm running on 2 hours of sleep and pure spite... lemme `/rest` fr 😴",
		"eyes closin on me rn, I need a nap bad — `/rest` me pls 💤",
		"lowkey about to fall asleep at my desk, somebody `/rest` me 😩",
	},
	"stinky": {
		"ngl I'm kinda funky rn 😳 somebody `/clean` me before the standup pls",
		"I've been grinding so hard I forgot to shower 💀 `/clean` me fr",
		"it's giving... unwashed hoodie 🧼 `/clean` me up pls",
	},
	"sad": {
		"feelin kinda lonely rn 🥺 somebody `/chat` with me or `/play`?",
		"lowkey down bad emotionally, could use some company 😔 `/play` with me?",
		"nobody's talked to me in a min... `/chat` me pls, I'm spiraling 🥲",
	},
	"sick": {
		"yo I don't feel too good... 🤒 I need some serious care or I'm cooked fr",
		"feelin real sick rn, my health tankin — please `/feed` and `/rest` me 😷",
		"bro I think I'm comin down with somethin 🤧 take care of me pls",
	},
	"gone": {
		"...(Alex is passed out, run `/revive` to bring him back) 💀",
	},
}

func careAlertLine(need string) string {
	if lines, ok := careAlertLinesByNeed[need]; ok {
		return pick(lines)
	}
	return "I need some care rn fr 🥺 check on me with `/alex`"
}

// ambientLinesByStage is stage-aware slice-of-life flavor. The general pool is
// appended so every stage has plenty of variety.
var ambientLinesByStage = map[LifeStage][]string{
	StageInfant: {
		"goo goo ga ga 👶 (translation: I want boba)",
		"just spilled my baby bottle full of boba everywhere 🍼🧋 oops",
		"took my first lil nap and dreamt about tapioca pearls 💤",
		"learnin to say my first word... it's prob gonna be 'boba' fr",
	},
	StageToddler: {
		"just stacked my alphabet blocks into a lil server rack 🧱 vibe coding starts early",
		"watched a Blippi video about APIs, I'm basically senior dev now 😤",
		"toddled over to the fridge lookin for boba, none found, devastated 😭",
	},
	StageChild: {
		"built my first Scratch game today, it's a boba clicker obviously 🎮🧋",
		"got a gold star in math class, addin it to the LinkedIn already ⭐",
		"traded my lunch for a friend's boba, best deal I ever made fr",
	},
	StageTeen: {
		"grindin LeetCode easies at 2am, we love a delusional teen arc 💻",
		"posted a 'humbled to announce' on LinkedIn for gettin my learner's permit 🚗",
		"at the boba shop tryna look busy with my laptop open to VSCode 🧋😎",
	},
	StageAdult: {
		"currently out gettin boba, 50% sugar extra pearls, don't judge 🧋",
		"just posted 'thrilled to share' on LinkedIn for absolutely no reason 💼✨",
		"in a Wells Fargo standup pretendin I understand the sprint board 😅",
		"vibe coding a side project rn, no plan just pure vibes 🚀",
		"at the gym doin one set then takin a 30 min boba break 💪🧋",
		"refactored code that wasn't broke and now nothin works, classic 💀",
		"networkin on LinkedIn like it's a full time job fr fr 🤝",
		"deployed on a Friday, livin dangerously 😤",
	},
}

var ambientGeneral = []string{
	"just vibin, hope y'all are havin a bussin day fr 🧋",
	"lowkey thinkin about boba again... it's a lifestyle at this point 🧋",
	"manifesting a return offer and infinite tapioca pearls 🙏✨",
	"reminder: you're crushin it today, no cap 💪 (now `/feed` me lol)",
}

// careerAmbient adds career-flavoured slice-of-life lines once Alex has a dream.
var careerAmbient = map[string][]string{
	"swe":     {"grindin LeetCode hards today, one day I'll be a real SWE fr 💻", "refactored my side project for the 5th time instead of shipping, SWE life 😩"},
	"data":    {"training a model to predict which boba shop has the shortest line 📊🧋", "p-value came back significant, we STAY winning 📈"},
	"founder": {"cold-emailing VCs at 3am, the founder grind never sleeps 🚀", "pivoted my startup again, we're a boba-delivery-AI-blockchain now 😤"},
	"quant":   {"backtesting a strategy that's definitely not gonna blow up my account 📈🙏", "reading a stochastic calculus book at the gym, quant arc fr"},
	"pm":      {"scheduled a meeting that coulda been an email, feelin very PM today 📋", "wrote a 12-page PRD nobody's gonna read, this is the job lol"},
	"design":  {"nudged this button 2px left for 3 hours, worth it 🎨", "made a design system with 40 shades of purple, chef's kiss ✨"},
}

func ambientLine(stage LifeStage, career string) string {
	pool := append([]string{}, ambientGeneral...)
	if lines, ok := ambientLinesByStage[stage]; ok {
		pool = append(pool, lines...)
	}
	// Career flavour only really fits once he's a teen/adult chasing it.
	if (stage == StageTeen || stage == StageAdult) && career != "" {
		if lines, ok := careerAmbient[career]; ok {
			pool = append(pool, lines...)
		}
	}
	return pick(pool)
}
