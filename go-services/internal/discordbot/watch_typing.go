package discordbot

import (
	"context"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Compose sessions: he started typing, and then either sent it or did not.
//
// Every other column on `/sohumtracker` records something he DID. This one is
// the only trace the gateway can give of something he decided against — he
// opened a channel, typed for forty seconds, and then closed it. That is worth
// exactly one figure on the page and nothing more, which is why it is a count
// and a duration rather than anything about what he was typing (Discord does not
// send that, and would not be told it if it did).
//
// # Coalescing
//
// Discord re-sends TYPING_START roughly every eight seconds while somebody keeps
// typing, so one run of composing is many events. They fold into one row by
// extending `lastTypingAt` while the gap stays under `typingIdleWindow`; a
// longer gap starts a new run. A message from him in that channel settles the
// open run as `sent`.
//
// # Settling
//
// A run is judged only once it is SETTLED — by a message, or by the idle window
// passing with none. An open run is not an abandoned message, it is one he might
// still be writing, and the rollup skips it for that reason.

// typingIdleWindow is how long after the last TYPING_START a run stays open.
//
// Discord's own indicator expires after ten seconds and the client re-sends
// while a key is being pressed, so anything under ~12s would split one pause for
// thought into two runs. Thirty seconds is comfortably past that and still short
// enough that "he typed something and didn't send it" is decided within the
// minute rather than at the end of the day.
const typingIdleWindow = 30 * time.Second

// HandleTyping records that a tracked user started (or is still) typing.
//
// TYPING_START arrives for every member of every channel the bot can see, so the
// allowlist check is the first thing and the overwhelmingly common outcome.
func (w *WatchService) HandleTyping(ctx context.Context, s *discordgo.Session, e *discordgo.TypingStart) {
	if w == nil || e == nil || !w.tracks(e.UserID) {
		return
	}
	// `e.Timestamp` is Unix seconds and is 0 on some gateway builds; a zero
	// there would open a run in 1970 and never settle.
	at := time.Now().UTC()
	if e.Timestamp > 0 {
		at = time.Unix(int64(e.Timestamp), 0).UTC()
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	if err := w.repo.touchTypingSession(ctx, &typingSession{
		DiscordID:    e.UserID,
		GuildID:      e.GuildID,
		ChannelID:    e.ChannelID,
		ChannelName:  channelName(s, e.ChannelID),
		StartedAt:    at,
		LastTypingAt: at,
	}, typingIdleWindow); err != nil {
		w.logger.Warn("watch: typing", "userId", e.UserID, "error", err)
		return
	}
	if err := w.recomputeDay(ctx, e.UserID, w.dateKey(at)); err != nil {
		w.logger.Warn("watch: recompute after typing", "error", err)
	}
}

// settleTypingForMessage marks the open run in a channel as having produced a
// message. Called from the message handler, which already holds `mu`.
func (w *WatchService) settleTypingForMessage(ctx context.Context, discordID, channelID string, at time.Time) {
	if err := w.repo.settleTypingSession(ctx, discordID, channelID, at, true); err != nil {
		w.logger.Warn("watch: settle typing on message", "userId", discordID, "error", err)
	}
}

// sweepTyping settles every run whose idle window has passed with no message.
//
// Runs on the flush tick rather than on a timer per run: one indexed query a
// minute settles all of them, where a timer per run would be a goroutine per
// keystroke burst and would lose every pending verdict on a restart. The
// settled-at is the run's own last typing event, NOT `now` — a worker that was
// down for an hour must not record an hour-long compose session.
func (w *WatchService) sweepTyping(ctx context.Context, now time.Time) {
	open, err := w.repo.openTypingSessions(ctx)
	if err != nil {
		w.logger.Warn("watch: sweep typing", "error", err)
		return
	}
	cutoff := now.Add(-typingIdleWindow)
	for _, run := range open {
		if run.LastTypingAt.After(cutoff) {
			continue // still typing, or might be
		}
		if err := w.repo.settleTypingSession(ctx, run.DiscordID, run.ChannelID, run.LastTypingAt, false); err != nil {
			w.logger.Warn("watch: settle typing", "userId", run.DiscordID, "error", err)
			continue
		}
		if err := w.recomputeDay(ctx, run.DiscordID, w.dateKey(run.StartedAt)); err != nil {
			w.logger.Warn("watch: recompute after typing sweep", "error", err)
		}
	}
}
