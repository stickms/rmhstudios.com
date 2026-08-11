// watch_rollup.go turns the raw session and message rows into the per-day
// aggregate the calendar renders from.
//
// The rollup is RECOMPUTED, never incremented (see the design note at the top of
// watch.go): every figure below is a pure function of the rows that exist, so a
// duplicated gateway event, a restart mid-session or a handler that runs twice
// cannot inflate a total. The two reaction counters are the sole exception and
// this file never writes them.
//
// # Local days, not UTC days
//
// Every boundary here is local to the tracking timezone. A voice session that
// runs from 9pm to 3am is not "a six-hour session on Tuesday" — it is five hours
// of Tuesday and three of Wednesday, and the 3am tail is the part this page
// exists to point at. `dayBounds` converts a YYYY-MM-DD into the pair of UTC
// instants that bracket it, and every overlap is measured against that pair.
package discordbot

import (
	"context"
	"fmt"
	"sort"
	"time"
)

// hoursPerDay is the size of the two per-day histograms.
const hoursPerDay = 24

// playingActivityTypes are the Discord activity types that count as "playing
// something" for the gaming figures: 0 Playing and 5 Competing. Listening and
// watching are real activities but they are not what the page is about, and
// folding Spotify into "hours gaming" would make the headline number a lie.
var playingActivityTypes = map[int]bool{0: true, 5: true}

// dayRollup is one row of `discord_watch_day`.
type dayRollup struct {
	DiscordID string
	DateKey   string
	TimeZone  string

	VoiceSec        int
	VoiceSessions   int
	LongestVoiceSec int
	MutedSec        int
	DeafenedSec     int
	StreamingSec    int
	VideoSec        int
	AloneSec        int
	LateNightSec    int

	// Time at each status. Mutually exclusive — a status is one value — so
	// these sum to his presence for the day.
	OnlineSec int
	IdleSec   int
	DndSec    int

	// Time signed in on each client. These OVERLAP: desktop and mobile are
	// routinely both true, so the three can sum to more than the presence
	// total above. That is the honest reading, not double counting.
	DesktopSec int
	MobileSec  int
	WebSec     int

	Messages    int
	Words       int
	Characters  int
	Attachments int
	Links       int
	Mentions    int
	Emoji       int
	Stickers    int
	Replies     int
	Questions   int

	LateNightMessages int
	ReactionsGiven    int
	ReactionsReceived int

	// Messages that read as being about looking for work, per watch_jobhunt.go.
	JobMentions int

	// Compose sessions started on this day, and the ones no message came out
	// of. Counted on the day the typing STARTED, matching how a voice session
	// is counted on the day it began.
	TypingStarts       int
	TypingAbandoned    int
	TypingAbandonedSec int

	GamingSec    int
	GameSessions int
	TopGame      string
	TopGameSec   int

	TopChannel         string
	TopChannelMessages int

	HourlyMessages []int
	HourlyVoiceSec []int

	FirstSeenAt *time.Time
	LastSeenAt  *time.Time
}

// dayBounds converts a local YYYY-MM-DD into the [from, to) UTC instants that
// bracket it. Built with time.Date in the location rather than by adding 24
// hours, so a DST day is 23 or 25 hours long exactly as it really was.
func dayBounds(dateKey string, loc *time.Location) (time.Time, time.Time, error) {
	day, err := time.ParseInLocation("2006-01-02", dateKey, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("bad dateKey %q: %w", dateKey, err)
	}
	next := time.Date(day.Year(), day.Month(), day.Day()+1, 0, 0, 0, 0, loc)
	return day.UTC(), next.UTC(), nil
}

// overlapSeconds is the length of the intersection of two intervals, in whole
// seconds, or 0 when they do not meet.
func overlapSeconds(aStart, aEnd, bStart, bEnd time.Time) int {
	start := aStart
	if bStart.After(start) {
		start = bStart
	}
	end := aEnd
	if bEnd.Before(end) {
		end = bEnd
	}
	if !end.After(start) {
		return 0
	}
	return int(end.Sub(start).Seconds())
}

// recomputeSpan recomputes every local day an interval touches — the caller for
// a session that has just closed, which may have run across midnight.
func (w *WatchService) recomputeSpan(ctx context.Context, discordID string, from, to time.Time) error {
	if to.Before(from) {
		from, to = to, from
	}
	// Walk local midnights rather than adding 24h, so a DST transition inside
	// the span does not skip or repeat a day.
	cursor := from
	for !cursor.After(to) {
		if err := w.recomputeDay(ctx, discordID, w.dateKey(cursor)); err != nil {
			return err
		}
		local := cursor.In(w.loc)
		next := time.Date(local.Year(), local.Month(), local.Day()+1, 0, 0, 0, 0, w.loc).UTC()
		if !next.After(cursor) {
			return nil // defensive: never spin if a zone gives us no forward step
		}
		cursor = next
	}
	return nil
}

// recomputeDay rebuilds one day's aggregate from the raw rows and writes it.
func (w *WatchService) recomputeDay(ctx context.Context, discordID, dateKey string) error {
	from, to, err := dayBounds(dateKey, w.loc)
	if err != nil {
		return err
	}
	now := time.Now().UTC()

	messages, err := w.repo.messagesForDay(ctx, discordID, from, to)
	if err != nil {
		return fmt.Errorf("messages for %s: %w", dateKey, err)
	}
	voice, err := w.repo.voiceSessionsOverlapping(ctx, discordID, from, to)
	if err != nil {
		return fmt.Errorf("voice for %s: %w", dateKey, err)
	}
	presence, err := w.repo.presenceSessionsOverlapping(ctx, discordID, from, to)
	if err != nil {
		return fmt.Errorf("presence for %s: %w", dateKey, err)
	}
	statuses, err := w.repo.statusSessionsOverlapping(ctx, discordID, from, to)
	if err != nil {
		return fmt.Errorf("status for %s: %w", dateKey, err)
	}
	typing, err := w.repo.typingSessionsStartedIn(ctx, discordID, from, to)
	if err != nil {
		return fmt.Errorf("typing for %s: %w", dateKey, err)
	}

	roll := buildDayRollup(discordID, dateKey, w.cfg.TimeZone, w.loc, from, to, now,
		messages, voice, presence, statuses, typing)
	return w.repo.writeDayRollup(ctx, roll)
}

// buildDayRollup is the pure aggregation, split out so the arithmetic — the
// midnight splits, the proration, the histograms — is testable without a
// database or a gateway.
func buildDayRollup(
	discordID, dateKey, timeZone string,
	loc *time.Location,
	from, to, now time.Time,
	messages []*watchMessage,
	voice []*voiceSession,
	presence []*presenceSession,
	statuses []*statusSession,
	typing []*typingSession,
) *dayRollup {
	d := &dayRollup{
		DiscordID:      discordID,
		DateKey:        dateKey,
		TimeZone:       timeZone,
		HourlyMessages: make([]int, hoursPerDay),
		HourlyVoiceSec: make([]int, hoursPerDay),
	}

	// ── Messages ──
	byChannel := map[string]int{}
	for _, m := range messages {
		d.Messages++
		d.Words += m.WordCount
		d.Characters += m.CharCount
		d.Attachments += m.Attachments
		d.Links += m.Links
		d.Mentions += m.Mentions
		d.Emoji += m.Emoji
		d.Stickers += m.Stickers
		if m.IsReply {
			d.Replies++
		}
		if m.IsQuestion {
			d.Questions++
		}
		if m.IsLateNight {
			d.LateNightMessages++
		}
		if m.MentionsJob {
			d.JobMentions++
		}
		if h := m.SentAt.In(loc).Hour(); h >= 0 && h < hoursPerDay {
			d.HourlyMessages[h]++
		}
		label := m.ChannelName
		if label == "" {
			label = m.ChannelID
		}
		byChannel[label]++
		touch(&d.FirstSeenAt, &d.LastSeenAt, m.SentAt)
	}
	d.TopChannel, d.TopChannelMessages = topEntry(byChannel)

	// ── Voice ──
	// `lateFrom`/`lateTo` bracket the local small hours of THIS day, so the
	// late-night figure is the part of the session that fell inside them rather
	// than the whole session for having touched them.
	local := from.In(loc)
	lateFrom := time.Date(local.Year(), local.Month(), local.Day(), lateNightStart, 0, 0, 0, loc).UTC()
	lateTo := time.Date(local.Year(), local.Month(), local.Day(), lateNightEnd, 0, 0, 0, loc).UTC()

	for _, v := range voice {
		end := sessionEnd(v.LeftAt, now)
		inDay := overlapSeconds(v.JoinedAt, end, from, to)
		if inDay <= 0 {
			continue
		}
		d.VoiceSec += inDay
		if inDay > d.LongestVoiceSec {
			d.LongestVoiceSec = inDay
		}
		// Count a session on the day it STARTED, so one long call is one session
		// rather than one on each side of midnight.
		if !v.JoinedAt.Before(from) && v.JoinedAt.Before(to) {
			d.VoiceSessions++
		}
		d.LateNightSec += overlapSeconds(v.JoinedAt, end, lateFrom, lateTo)

		// The toggle counters are session totals with no timestamps of their own,
		// so a session spanning midnight prorates them by the share of it that
		// fell in this day. Exact for the overwhelmingly common case (a session
		// inside one day, share == 1) and a defensible split otherwise.
		total := int(end.Sub(v.JoinedAt).Seconds())
		share := 1.0
		if total > 0 {
			share = float64(inDay) / float64(total)
		}
		d.MutedSec += scale(v.MutedSec, share)
		d.DeafenedSec += scale(v.DeafenedSec, share)
		d.StreamingSec += scale(v.StreamingSec, share)
		d.VideoSec += scale(v.VideoSec, share)
		d.AloneSec += scale(v.AloneSec, share)

		addHourlyVoice(d.HourlyVoiceSec, v.JoinedAt, end, from, to, loc)
		touch(&d.FirstSeenAt, &d.LastSeenAt, maxTime(v.JoinedAt, from))
		touch(&d.FirstSeenAt, &d.LastSeenAt, minTime(end, to))
	}

	// ── Time online ──
	//
	// Same overlap-with-the-day arithmetic as voice, and for the same reason: a
	// run that started before local midnight belongs to both days, split at the
	// boundary. Whether he was online at 2am is exactly the sort of thing this
	// page is for, so it must not be credited wholly to whichever day it began.
	for _, st := range statuses {
		end := sessionEnd(st.EndedAt, now)
		inDay := overlapSeconds(st.StartedAt, end, from, to)
		if inDay <= 0 {
			continue
		}
		switch st.Status {
		case "online":
			d.OnlineSec += inDay
		case "idle":
			d.IdleSec += inDay
		case "dnd":
			d.DndSec += inDay
		}
		// Client time is added independently of the status and of each other,
		// which is what makes these three able to exceed the presence total.
		if st.Clients.Desktop {
			d.DesktopSec += inDay
		}
		if st.Clients.Mobile {
			d.MobileSec += inDay
		}
		if st.Clients.Web {
			d.WebSec += inDay
		}
		touch(&d.FirstSeenAt, &d.LastSeenAt, maxTime(st.StartedAt, from))
		touch(&d.FirstSeenAt, &d.LastSeenAt, minTime(end, to))
	}

	// ── Games ──
	byGame := map[string]int{}
	for _, p := range presence {
		if !playingActivityTypes[p.ActivityType] {
			continue
		}
		end := sessionEnd(p.EndedAt, now)
		inDay := overlapSeconds(p.StartedAt, end, from, to)
		if inDay <= 0 {
			continue
		}
		d.GamingSec += inDay
		if !p.StartedAt.Before(from) && p.StartedAt.Before(to) {
			d.GameSessions++
		}
		byGame[p.ActivityName] += inDay
		touch(&d.FirstSeenAt, &d.LastSeenAt, maxTime(p.StartedAt, from))
		touch(&d.FirstSeenAt, &d.LastSeenAt, minTime(end, to))
	}
	d.TopGame, d.TopGameSec = topEntry(byGame)

	// ── Typing ──
	//
	// Counted on the day the run STARTED, and not split across midnight the way
	// voice and presence are: a compose session is an EVENT (he sat there and
	// then did or did not send it), not a stretch of time occupied, and half of
	// one on either side of midnight would not mean anything. Its duration rides
	// along on the same day for the same reason.
	//
	// Unsettled runs are skipped entirely: a run with no verdict yet is not a
	// message he abandoned, it is a message he might still be writing.
	for _, tp := range typing {
		if tp.SettledAt == nil {
			continue
		}
		if tp.StartedAt.Before(from) || !tp.StartedAt.Before(to) {
			continue
		}
		d.TypingStarts++
		if !tp.Sent {
			d.TypingAbandoned++
			d.TypingAbandonedSec += tp.DurationSec
		}
	}

	return d
}

// addHourlyVoice distributes a session's seconds across the local hours it
// covers, clipped to the day. Walking hour boundaries with time.Date rather than
// adding an hour keeps a DST day's buckets lined up with the wall clock.
func addHourlyVoice(buckets []int, start, end, dayFrom, dayTo time.Time, loc *time.Location) {
	start = maxTime(start, dayFrom)
	end = minTime(end, dayTo)
	if !end.After(start) {
		return
	}
	cursor := start
	for cursor.Before(end) {
		local := cursor.In(loc)
		next := time.Date(local.Year(), local.Month(), local.Day(), local.Hour()+1, 0, 0, 0, loc).UTC()
		if next.After(end) {
			next = end
		}
		if h := local.Hour(); h >= 0 && h < len(buckets) {
			buckets[h] += int(next.Sub(cursor).Seconds())
		}
		if !next.After(cursor) {
			return // defensive: never spin on a zero-length step
		}
		cursor = next
	}
}

// sessionEnd is a session's end instant: its recorded one, or `now` while it is
// still open — which is what makes a live figure live.
func sessionEnd(endedAt *time.Time, now time.Time) time.Time {
	if endedAt != nil {
		return *endedAt
	}
	return now
}

// topEntry returns the largest entry of a tally, ties broken by name so the
// result is stable across recomputes rather than flickering with map order.
func topEntry(tally map[string]int) (string, int) {
	type pair struct {
		name  string
		value int
	}
	pairs := make([]pair, 0, len(tally))
	for name, value := range tally {
		pairs = append(pairs, pair{name, value})
	}
	sort.Slice(pairs, func(i, j int) bool {
		if pairs[i].value != pairs[j].value {
			return pairs[i].value > pairs[j].value
		}
		return pairs[i].name < pairs[j].name
	})
	if len(pairs) == 0 {
		return "", 0
	}
	return pairs[0].name, pairs[0].value
}

// scale applies a proration share, rounding to the nearest second.
func scale(v int, share float64) int {
	if v <= 0 {
		return 0
	}
	if share >= 1 {
		return v
	}
	return int(float64(v)*share + 0.5)
}

// touch widens the first/last-seen window to include an instant.
func touch(first, last **time.Time, t time.Time) {
	if t.IsZero() {
		return
	}
	at := t
	if *first == nil || at.Before(**first) {
		*first = &at
	}
	if *last == nil || at.After(**last) {
		*last = &at
	}
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}
