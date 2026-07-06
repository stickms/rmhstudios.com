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

// plan carries the decision made under the guild lock out to the (unlocked) send.
type plan struct {
	kind    proactiveKind
	channel string
	pet     PetState
	mood    Mood
	need    string // for kindCareAlert
}

// careTick advances every pet and posts proactive messages.
func (ps *PetService) careTick(ctx context.Context) {
	s := ps.getSession()
	if s == nil {
		return
	}
	pets, err := ps.repo.allPets(ctx)
	if err != nil {
		ps.logger.Warn("care tick: load pets failed", "error", err)
		return
	}
	now := time.Now().UTC()
	for _, p := range pets {
		pl := ps.decideForPet(ctx, p.GuildID, now)
		if pl.kind == kindNone || pl.channel == "" {
			continue
		}
		ps.sendProactive(ctx, s, pl, now)
	}
}

// decideForPet locks the guild, advances the pet, decides the single proactive
// message to send (updating throttle timestamps + persisting), and returns the
// plan. All state writes happen here under the lock; the send happens after.
func (ps *PetService) decideForPet(ctx context.Context, guildID string, now time.Time) plan {
	mu := ps.lockGuild(guildID)
	mu.Lock()
	defer mu.Unlock()

	pet, ok, err := ps.repo.load(ctx, guildID)
	if err != nil || !ok {
		return plan{}
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
		} else if pet.Alive && ambientDue(pet.LastAmbientAt, now, guildID) {
			kind = kindAmbient
			t := now
			pet.LastAmbientAt = &t
		}
	}

	// Persist the decay + any throttle-timestamp updates regardless of send outcome
	// (so a failed send can't cause a re-spam next tick).
	if err := ps.repo.save(ctx, pet); err != nil {
		ps.logger.Warn("care tick save failed", "guild", guildID, "error", err)
	}

	if kind == kindNone || pet.LastChannelID == "" {
		return plan{kind: kindNone}
	}
	return plan{kind: kind, channel: pet.LastChannelID, pet: *pet, mood: pet.mood(), need: need}
}

// dueSince reports whether `interval` has elapsed since `last` (nil last = due).
func dueSince(last *time.Time, interval time.Duration, now time.Time) bool {
	return last == nil || now.Sub(*last) >= interval
}

// ambientDue adds per-pet random jitter so ambient posts don't all fire in lockstep.
func ambientDue(last *time.Time, now time.Time, guildID string) bool {
	base := ambientMinInterval()
	if last == nil {
		// First ever: stagger the very first ambient post a bit.
		return rand.Intn(3) == 0
	}
	threshold := base + time.Duration(rand.Int63n(int64(ambientJitter)+1))
	return now.Sub(*last) >= threshold
}

// sendProactive delivers the planned message (outside the guild lock). For a
// grow-up milestone it tries to attach a fresh selfie.
func (ps *PetService) sendProactive(ctx context.Context, s *discordgo.Session, pl plan, now time.Time) {
	var msg *discordgo.MessageSend
	switch pl.kind {
	case kindDied:
		msg = &discordgo.MessageSend{Embeds: []*discordgo.MessageEmbed{{
			Color:       0x6b7280,
			Title:       "💀 RIP Alex (for now)",
			Description: fmt.Sprintf("**%s** passed out from neglect... y'all gotta take better care 🥀\nSomeone run `/revive` to bring him back for a fresh start 🙏", pl.pet.Name),
		}}}
	case kindGrewUp:
		embed := &discordgo.MessageEmbed{
			Color:       0x34d399,
			Title:       "🎉 Alex leveled up in life!",
			Description: fmt.Sprintf("**%s** just grew into a **%s**! 🥹 they really do grow up fast...\nsay hi with `/chat` or check on him with `/alex`", pl.pet.Name, stageLabel[pl.pet.LifeStage]),
		}
		msg = &discordgo.MessageSend{Embeds: []*discordgo.MessageEmbed{embed}}
		// Milestone selfie (bounded by budget + cache; best-effort).
		if img, err := ps.imager.generate(ctx, &pl.pet, pl.mood, now); err == nil {
			embed.Image = &discordgo.MessageEmbedImage{URL: "attachment://" + img.Filename}
			msg.Files = []*discordgo.File{imageFile(img)}
		}
	case kindCareAlert:
		msg = &discordgo.MessageSend{Content: "🧋 **Alex:** " + careAlertLine(pl.need)}
	case kindAmbient:
		msg = &discordgo.MessageSend{Content: "🧋 **Alex:** " + ambientLine(pl.pet.LifeStage)}
	default:
		return
	}

	if _, err := s.ChannelMessageSendComplex(pl.channel, msg); err != nil {
		ps.handleSendError(ctx, pl.pet.GuildID, pl.channel, err)
	}
}

// handleSendError clears a dead/forbidden channel so we stop posting into a
// place we can't reach; other errors are just logged.
func (ps *PetService) handleSendError(ctx context.Context, guildID, channelID string, err error) {
	var rerr *discordgo.RESTError
	if errors.As(err, &rerr) && rerr.Message != nil {
		switch rerr.Message.Code {
		case discordgo.ErrCodeUnknownChannel, discordgo.ErrCodeMissingAccess, discordgo.ErrCodeMissingPermissions:
			ps.logger.Info("clearing unreachable alex channel", "guild", guildID, "channel", channelID, "code", rerr.Message.Code)
			mu := ps.lockGuild(guildID)
			mu.Lock()
			if pet, ok, e := ps.repo.load(ctx, guildID); e == nil && ok && pet.LastChannelID == channelID {
				pet.LastChannelID = ""
				_ = ps.repo.save(ctx, pet)
			}
			mu.Unlock()
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

func ambientLine(stage LifeStage) string {
	pool := append([]string{}, ambientGeneral...)
	if lines, ok := ambientLinesByStage[stage]; ok {
		pool = append(pool, lines...)
	}
	return pick(pool)
}
