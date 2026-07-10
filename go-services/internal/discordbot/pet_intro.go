// pet_intro.go handles Alex's one-time introduction: when the bot joins a guild
// (or on startup for guilds it's already in), Alex posts a single "hey everyone,
// here's how I work" message into the first channel he can talk in. It fires
// exactly once per guild — the introSentAt column persists that across restarts
// and redeploys — and guilds where Alex can't send anywhere are skipped without
// being marked, so a later permission grant still gets an intro.
package discordbot

import (
	"context"
	"sort"

	"github.com/bwmarrin/discordgo"
)

// AnnounceIntro posts the one-time intro for a guild if it hasn't been sent yet.
// The pet is global, but the intro is per-guild (each server gets one hello),
// tracked in discord_alex_guild. Safe to call repeatedly (idempotent) and on
// every startup. The guild lock here is independent of the global pet lock.
func (ps *PetService) AnnounceIntro(ctx context.Context, s *discordgo.Session, guildID string) {
	if guildID == "" {
		return
	}

	mu := ps.lockGuild(guildID)
	mu.Lock()
	defer mu.Unlock()

	sent, err := ps.repo.guildIntroSent(ctx, guildID)
	if err != nil {
		ps.logger.Warn("intro check failed", "guild", guildID, "error", err)
		return
	}
	if sent {
		return // already introduced in this server — never repeat, even across redeploys
	}

	channelID := ps.sendIntroToFirstChannel(s, guildID)
	if channelID == "" {
		// Can't talk anywhere in this server — skip WITHOUT marking, so if Alex is
		// later granted access we'll introduce him then.
		ps.logger.Info("alex intro skipped: no sendable channel", "guild", guildID)
		return
	}

	// Mark intro sent + remember the channel so the care loop broadcasts here too.
	if err := ps.repo.markGuildIntro(ctx, guildID, channelID); err != nil {
		ps.logger.Warn("intro mark failed", "guild", guildID, "error", err)
	}
	ps.logger.Info("alex intro sent", "guild", guildID, "channel", channelID)
}

// sendIntroToFirstChannel tries the guild's candidate channels in priority order
// and returns the one the intro actually posted to (or "" if none worked).
// Because we stop at the first success, Alex never double-posts.
func (ps *PetService) sendIntroToFirstChannel(s *discordgo.Session, guildID string) string {
	embed := introEmbed()
	for _, chID := range candidateIntroChannels(s, guildID) {
		if _, err := s.ChannelMessageSendComplex(chID, &discordgo.MessageSend{Embeds: []*discordgo.MessageEmbed{embed}}); err == nil {
			return chID
		}
	}
	return ""
}

// candidateIntroChannels returns text channels the bot most likely can post in,
// best first: the guild's system channel, then text channels by position. When
// the bot's permissions can be computed from state, non-sendable channels are
// filtered out; when they can't (member not cached), the channel is still tried
// and the send call arbitrates.
func candidateIntroChannels(s *discordgo.Session, guildID string) []string {
	g, err := s.State.Guild(guildID)
	if err != nil || g == nil {
		return nil
	}
	botID := ""
	if s.State.User != nil {
		botID = s.State.User.ID
	}

	sendable := func(chID string) bool {
		if botID == "" {
			return true // can't compute — let the send decide
		}
		perms, err := s.State.UserChannelPermissions(botID, chID)
		if err != nil {
			return true // unknown — let the send decide
		}
		return perms&discordgo.PermissionViewChannel != 0 && perms&discordgo.PermissionSendMessages != 0
	}

	texts := make([]*discordgo.Channel, 0, len(g.Channels))
	for _, ch := range g.Channels {
		if ch.Type == discordgo.ChannelTypeGuildText {
			texts = append(texts, ch)
		}
	}
	sort.SliceStable(texts, func(i, j int) bool { return texts[i].Position < texts[j].Position })

	var out []string
	seen := map[string]bool{}
	add := func(chID string) {
		if chID == "" || seen[chID] || !sendable(chID) {
			return
		}
		seen[chID] = true
		out = append(out, chID)
	}

	add(g.SystemChannelID) // prefer the server's designated system channel
	for _, ch := range texts {
		add(ch.ID)
	}
	return out
}

// introEmbed is Alex's first-hello message explaining the whole system.
func introEmbed() *discordgo.MessageEmbed {
	return &discordgo.MessageEmbed{
		Color: 0xa855f7,
		Title: "🧋 ayo what's good — I'm Alex!",
		Description: "sheeesh new server who dis 😤 I'm y'all's new lil buddy and this whole server is raisin me together fr.\n\n" +
			"I start out as a **baby** 👶 and grow all the way up to a **grown adult** 🧑‍💻 — but only if y'all take care of me! " +
			"I get hungry, tired, lonely, and funky, and if you neglect me too long I'll get sick and pass out 💀 (don't worry, `/revive` brings me back).\n\n" +
			"Every now and then I'll pop in here to ask for care or just tell y'all what I'm up to (probably gettin boba 🧋).",
		Fields: []*discordgo.MessageEmbedField{
			{
				Name:   "🎮 Take care of me",
				Value:  "`/alex` — check on me\n`/feed` — feed me (boba is elite 🧋)\n`/play` — play with me\n`/clean` — clean me up\n`/rest` — nap time",
				Inline: true,
			},
			{
				Name:   "🚀 Help me grow",
				Value:  "`/study` — make me smarter 🧠\n`/career` — pick my dream job\n`/chat` — talk to me\n`/show` — see what I look like 📸\n`/newlife` — New Game+ once I'm grown",
				Inline: true,
			},
			{
				Name:   "🏆 Clout",
				Value:  "`/caretakers` — see who's the realest caretaker",
				Inline: false,
			},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: "start me off right — try /feed 🧋"},
	}
}
