package discordbot

import (
	"context"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Catching up with a status he was already showing.
//
// Exactly the same blind spot as the voice one next door, and for the same
// reason: `PRESENCE_UPDATE` fires on a TRANSITION. Somebody who was already
// online when the bot connected — and who then simply stays online, which is
// the normal case for the person this page is about — generates no presence
// event at all. Until he changes status, the tracker has never been told what
// his status IS.
//
// The symptoms of that are precise and were both reported:
//
//   - **The card says offline.** `discord_watch_live` is written ONLY by the
//     presence handler. `Reconcile` settles the status session LOG on a guild
//     sync but never touched the live row, so the dot and the "Online · for 3h"
//     line stayed at their defaults no matter what the log said.
//   - **Nothing accrues.** With no `PRESENCE_UPDATE` there is no open status
//     session, so the day's online/idle/dnd and desktop/mobile/web totals sit at
//     zero while he is demonstrably online.
//   - **No activities.** The "Playing …" rows come from presence sessions, which
//     open on the same event, so a game already running is invisible too.
//
// `Reconcile` covers the connect moment. This covers every minute after it, and
// it recovers the failure `Reconcile` cannot: a presence write that ERRORED
// (a database blip) is never retried by an event that will not come again.
//
// Reusing `applyPresence` rather than reimplementing it is deliberate — a second
// reading of "what a presence means" is how the card and the log end up
// disagreeing about whether he is online.
//
// # The one thing the cache gets wrong, and why this sweep is narrow
//
// discordgo's `presenceAdd` merges rather than replaces, and it only copies a
// client status when the incoming one is NON-EMPTY:
//
//	if presence.ClientStatus.Desktop != "" { … }
//
// Discord signals "signed out of desktop" by OMITTING that field, so the cached
// `ClientStatus` never loses a client once it has seen one. Sign out of desktop
// and the cache claims desktop forever.
//
// The live handler is unaffected — it reads the event payload, which is right.
// But a sweep that blindly re-applied the cache would, a minute later, "correct"
// an accurate desktop-off run back into a wrong desktop-on one, and go on doing
// that for the rest of the evening. It would corrupt the very figures it exists
// to protect.
//
// So the sweep is deliberately narrow: it ADOPTS when the tracker knows nothing,
// and otherwise only refreshes the live card, whose fields (status, activities,
// custom status) the cache does replace wholesale and therefore does hold
// correctly. Events stay in charge of the session log once a run is open.

// syncPresenceFromState fills in a presence the events never delivered.
//
// Cheap despite running every tick: the common path is one idempotent upsert
// whose `statusChangedAt` only moves when the status actually differs, so a
// steady hour online is no session churn at all.
//
// Caller MUST already hold `w.mu` — `flush` does, and `sync.Mutex` is not
// reentrant. Same contract as `syncVoiceFromState` and `sweepTyping`.
func (w *WatchService) syncPresenceFromState(ctx context.Context, s *discordgo.Session, now time.Time) {
	if w == nil || s == nil || s.State == nil {
		return
	}

	for id := range w.watched {
		presence, guildID := lookupPresence(s, id)
		if presence == nil {
			// Not in the cache. That is "we have not been told", NOT "offline":
			// a guild that has not loaded its presences looks identical to one
			// where he is absent. A genuine sign-off arrives as a
			// `PRESENCE_UPDATE` with status offline, which the handler acts on,
			// and `Reconcile` retires anything left dangling at the next connect.
			continue
		}
		// The user object on a cached presence can be a stub carrying only an id.
		event := &discordgo.PresenceUpdate{Presence: *presence, GuildID: guildID}
		if event.User == nil || strings.TrimSpace(string(event.Status)) == "" {
			continue
		}

		open, err := w.repo.openStatusSession(ctx, id)
		if err != nil {
			w.logger.Warn("watch: presence sync lookup", "userId", id, "error", err)
			continue
		}

		if open == nil {
			// Nothing open: either he was already online when the bot connected
			// and no event ever came, or the write that should have opened this
			// run failed. Adopt the cached presence in full — the client set is
			// accurate as of the guild sync that populated it, and it is the only
			// answer available.
			w.applyPresence(ctx, event, now)
			if strings.TrimSpace(string(event.Status)) != "offline" {
				w.logger.Info("watch: adopted a presence that produced no event",
					"userId", id, "status", string(event.Status))
			}
			continue
		}

		// A run is already open, so the events own it — see the ClientStatus note
		// above for why the cache must not be allowed to rewrite the client set.
		// The card is still refreshed, because a status or activity that changed
		// without reaching us leaves the dot and the "Playing …" rows stale, and
		// those fields the cache does hold correctly.
		w.recordLiveStatus(ctx, event)
	}
}

// lookupPresence finds a user's cached presence and the guild it came from.
//
// Presence is a USER-level fact that Discord happens to deliver per guild, so
// the first guild that has him is as good as any — but the guild id still has to
// come back, because a presence session records which guild it was observed in.
func lookupPresence(s *discordgo.Session, userID string) (*discordgo.Presence, string) {
	if s == nil || s.State == nil {
		return nil, ""
	}
	s.State.RLock()
	defer s.State.RUnlock()

	for _, g := range s.State.Guilds {
		if g == nil {
			continue
		}
		for _, pr := range g.Presences {
			if pr == nil || pr.User == nil || pr.User.ID != userID {
				continue
			}
			// Copied rather than returned by reference: discordgo mutates these
			// in place as events arrive and the caller reads the result outside
			// the state lock.
			presence := *pr
			return &presence, g.ID
		}
	}
	return nil, ""
}
