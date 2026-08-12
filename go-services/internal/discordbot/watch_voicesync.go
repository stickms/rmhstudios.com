package discordbot

import (
	"context"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Catching up with a voice channel he was already in.
//
// `VOICE_STATE_UPDATE` only fires on a TRANSITION. Somebody already sitting in a
// channel generates no event at all, so an event-driven tracker is blind to them
// until they move or leave. `Reconcile` covers the obvious case — a guild sync
// carries its live voice states — but it only runs on `GUILD_CREATE`, which is
// once per connection. Between two of those, a join can be lost in at least four
// ways:
//
//  1. The DB was unreachable when the join arrived. `startVoice` returned an
//     error, the handler logged it, and nothing ever retried. He then sits in a
//     call for five hours and none of it is recorded. (The retry policy makes
//     this rarer, not impossible — a long outage still exhausts it.)
//  2. The gateway dropped and re-IDENTIFYed while he was mid-call. Discord
//     replays missed dispatches on RESUME but not across a fresh IDENTIFY, and
//     the resulting `GUILD_CREATE` only helps if it is actually delivered for
//     that guild.
//  3. A guild that arrived `Unavailable` at connect and became available later
//     without a second `GUILD_CREATE`.
//  4. A startup race: gateway events begin dispatching the moment `Open()`
//     returns, which is before `Start` has run its resume/retire sweep.
//
// The remedy is not to enumerate those. It is to stop treating events as the
// only source of truth: this sweep runs on every flush tick and makes the open
// rows match the gateway's own state cache, so ANY missed transition — cause
// unknown — self-heals within a minute.
//
// That is the same principle as the `/pf2ecal` reminder sweep: the state IS the
// schedule, so re-reading it is cheaper and more correct than trying to keep a
// derived copy in step with every event that could touch it.

// syncVoiceFromState reconciles every tracked user's open voice row against
// discordgo's state cache.
//
// The cache is maintained from the same events we handle, so this cannot recover
// a transition Discord never sent us — but it IS rebuilt wholesale from every
// `GUILD_CREATE`, and it does not care whether OUR write succeeded. That is
// exactly the gap it closes.
//
// Caller MUST already hold `w.mu` — `flush` does, and `sync.Mutex` is not
// reentrant, so taking it here would deadlock the whole tracker on the first
// tick. Same contract as `sweepTyping` beside it.
func (w *WatchService) syncVoiceFromState(ctx context.Context, s *discordgo.Session, now time.Time) {
	if w == nil || s == nil || s.State == nil {
		return
	}

	for id := range w.watched {
		live := lookupVoiceState(s, id)

		open, err := w.repo.openVoiceSession(ctx, id)
		if err != nil {
			w.logger.Warn("watch: voice sync lookup", "userId", id, "error", err)
			continue
		}

		switch {
		case live == nil && open == nil:
			// Not in voice and nothing open. The overwhelmingly common case.

		case live == nil:
			// An open row for somebody the gateway says is not in a channel.
			//
			// Only acted on when the cache actually KNOWS that guild: an empty
			// or not-yet-populated cache means "we have not been told", not "he
			// left", and closing on that would delete a live session every time
			// the gateway reconnected.
			if !stateKnowsGuild(s, open.GuildID) {
				continue
			}
			w.bankFlags(open, now)
			w.bankPeers(open, now, open.PeerCount)
			if err := w.repo.closeVoiceSession(ctx, open, now, "sync"); err != nil {
				w.logger.Warn("watch: voice sync close", "userId", id, "error", err)
				continue
			}
			w.logger.Info("watch: closed a voice session the gateway had already ended",
				"userId", id, "channelId", open.ChannelID)
			if err := w.recomputeSpan(ctx, id, open.JoinedAt, now); err != nil {
				w.logger.Warn("watch: voice sync recompute", "userId", id, "error", err)
			}

		case open == nil:
			// He is in a channel and we are not tracking it — the missed join
			// this whole file exists for.
			//
			// Dated `now`, not backdated: Discord's voice state carries no join
			// timestamp, so the true start is unknowable and the only honest
			// choice is to under-count. Logged at info because it means time was
			// lost, and a run of these is worth noticing.
			if err := w.startVoice(ctx, s, &discordgo.VoiceStateUpdate{VoiceState: live}, now); err != nil {
				w.logger.Warn("watch: voice sync open", "userId", id, "error", err)
				continue
			}
			w.logger.Info("watch: adopted a voice session that produced no join event",
				"userId", id, "channelId", live.ChannelID)

		case open.ChannelID != live.ChannelID:
			// A move whose event we never saw. Closed and reopened exactly as a
			// live move would have been, so the two channels do not merge into
			// one implausibly long session.
			w.bankFlags(open, now)
			w.bankPeers(open, now, open.PeerCount)
			if err := w.repo.closeVoiceSession(ctx, open, now, "move"); err != nil {
				w.logger.Warn("watch: voice sync move close", "userId", id, "error", err)
				continue
			}
			if err := w.startVoice(ctx, s, &discordgo.VoiceStateUpdate{VoiceState: live}, now); err != nil {
				w.logger.Warn("watch: voice sync move open", "userId", id, "error", err)
			}

		default:
			// Same channel: the row is right. The flags may still have drifted if
			// a mute/deafen event was missed, so they are corrected here — but
			// only when they actually differ. `beat` already writes this row
			// every tick, and an unconditional save here would double the write
			// volume of the busiest path in the tracker to change nothing.
			if open.SelfMute == live.SelfMute && open.SelfDeaf == live.SelfDeaf &&
				open.Streaming == live.SelfStream && open.Video == live.SelfVideo &&
				open.ServerMute == live.Mute && open.ServerDeaf == live.Deaf {
				continue
			}
			// Bank the stretch under the OLD flags before adopting the new ones,
			// exactly as a live flag change would have.
			w.bankFlags(open, now)
			open.SelfMute, open.SelfDeaf = live.SelfMute, live.SelfDeaf
			open.Streaming, open.Video = live.SelfStream, live.SelfVideo
			open.ServerMute, open.ServerDeaf = live.Mute, live.Deaf
			if err := w.repo.saveVoiceSession(ctx, open); err != nil {
				w.logger.Warn("watch: voice sync flags", "userId", id, "error", err)
			}
		}
	}
}

// lookupVoiceState finds a user's current voice state across every guild the
// bot can see, or nil when they are not in a channel anywhere.
//
// Across all guilds rather than one: a user is in at most one voice channel at a
// time, but the tracker does not know which guild that will be in, and asking
// per-guild would need a guild id we do not have until we have found them.
func lookupVoiceState(s *discordgo.Session, userID string) *discordgo.VoiceState {
	if s == nil || s.State == nil {
		return nil
	}
	s.State.RLock()
	defer s.State.RUnlock()

	for _, g := range s.State.Guilds {
		if g == nil {
			continue
		}
		for _, vs := range g.VoiceStates {
			if vs == nil || vs.UserID != userID || vs.ChannelID == "" {
				continue
			}
			// Copied rather than returned by reference: the caller reads it
			// outside the state lock, and discordgo mutates these in place as
			// events arrive.
			state := *vs
			if state.GuildID == "" {
				// Voice states inside a guild payload often omit their own
				// guild id; `startVoice` needs it.
				state.GuildID = g.ID
			}
			return &state
		}
	}
	return nil
}

// stateKnowsGuild reports whether the cache has anything to say about a guild.
//
// The distinction the "he left" branch depends on: a guild we cannot see is one
// we have not been told about, and silence is not evidence of absence.
func stateKnowsGuild(s *discordgo.Session, guildID string) bool {
	if s == nil || s.State == nil || guildID == "" {
		return false
	}
	g, err := s.State.Guild(guildID)
	return err == nil && g != nil
}
