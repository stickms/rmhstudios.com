// watch_status.go logs TIME ONLINE: how long he was online, idle or dnd, and
// which clients he was signed in on while he was.
//
// # Why this is a log and not a column
//
// `discord_watch_live` records a LEVEL — the status right now and when it last
// changed. That answers "is he online" and cannot answer "how long was he online
// yesterday, and how much of it was on his phone", because a level has no
// history. So presence gets the same treatment voice already had: one row per
// contiguous run, opened when the state changes and closed when it changes
// again, with the rollup recomputing day totals from those rows.
//
// # What counts as a change
//
// The STATUS (online/idle/dnd) and the CLIENT SET (desktop/mobile/web) together.
// Either moving ends the current run and starts a new one, which is what makes
// "six of those nine hours were on mobile" answerable at all.
//
// # Offline
//
// Offline closes the open run and opens nothing. A gap in the log is already an
// unambiguous "not online", and storing it would double the write volume to
// record something derivable. It also keeps the invariant the rollup relies on:
// every row in this table is time he was actually reachable.
package discordbot

import (
	"context"
	"time"

	"github.com/bwmarrin/discordgo"
)

// clientSet is which Discord clients a presence was signed in on.
//
// These are not exclusive: Discord reports each independently and desktop plus
// mobile at once is the normal case, not an edge one.
type clientSet struct {
	Desktop bool
	Mobile  bool
	Web     bool
}

// any reports whether he was signed in anywhere at all.
func (c clientSet) any() bool { return c.Desktop || c.Mobile || c.Web }

// clientsFrom reads the per-client statuses off a presence payload.
//
// A client is counted as present when Discord reports ANY status for it —
// including "idle" and "dnd", which are still a signed-in client. Only an empty
// string means "not signed in here".
func clientsFrom(cs discordgo.ClientStatus) clientSet {
	return clientSet{
		Desktop: cs.Desktop != "",
		Mobile:  cs.Mobile != "",
		Web:     cs.Web != "",
	}
}

// applyStatusSession advances the presence log for one status change.
//
// Called with the tracker's mutex already held, from the presence handler, so it
// can read-modify-write the open row without racing another event.
func (w *WatchService) applyStatusSession(
	ctx context.Context, discordID, status string, clients clientSet, now time.Time,
) error {
	open, err := w.repo.openStatusSession(ctx, discordID)
	if err != nil {
		return err
	}

	// Offline (or signed in nowhere) ends the run and starts nothing.
	if status == "offline" || !clients.any() {
		if open == nil {
			return nil
		}
		if err := w.repo.closeStatusSession(ctx, open, now, "offline"); err != nil {
			return err
		}
		return w.recomputeSpan(ctx, discordID, open.StartedAt, now)
	}

	// Unchanged: nothing to do but let the heartbeat keep the row fresh.
	if open != nil && open.Status == status && open.Clients == clients {
		return nil
	}

	if open != nil {
		if err := w.repo.closeStatusSession(ctx, open, now, "change"); err != nil {
			return err
		}
		if err := w.recomputeSpan(ctx, discordID, open.StartedAt, now); err != nil {
			return err
		}
	}

	if err := w.repo.insertStatusSession(ctx, &statusSession{
		DiscordID: discordID,
		Status:    status,
		Clients:   clients,
		StartedAt: now,
	}); err != nil {
		return err
	}
	return w.recomputeDay(ctx, discordID, w.dateKey(now))
}
