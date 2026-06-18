package recap

// Port of server/recap/index.ts — the Lights Out daily-recap runner.
//
// Every 5 minutes it looks for "discord_activity_channel" rows whose recap is
// due, builds a Discord embed summarising that guild's participants for the
// recap date, posts it to the channel, and clears the schedule.
//
// The orchestration is kept behind two small interfaces so the embed-building
// and participant-ranking logic can be tested with fakes (no real DB / Discord):
//   - Repo:   the DB queries (due channels, participants, clear).
//   - Poster: sending the built message to a Discord channel.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// Participant is the projection of a "discord_daily_participant" row needed to
// rank players and render the recap. Mirrors lib field usage in index.ts.
type Participant struct {
	Username    string
	Status      string
	Moves       *int
	RatingEmoji *string
	RatingLabel *string
}

// DueChannel is a "discord_activity_channel" row that has a recap due.
type DueChannel struct {
	ID           string
	GuildID      string
	ChannelID    string
	RecapDateKey string
}

// Repo abstracts the database access the recap loop needs.
type Repo interface {
	// DueChannels returns rows WHERE activity='lights-out' AND recapDueAt IS NOT
	// NULL AND recapDueAt <= now AND recapDateKey IS NOT NULL.
	DueChannels(ctx context.Context, now time.Time) ([]DueChannel, error)
	// Participants returns rows for (guildId, dateKey) ordered by moves asc.
	Participants(ctx context.Context, guildID, dateKey string) ([]Participant, error)
	// ClearRecap sets recapDateKey=NULL, recapDueAt=NULL for the channel id.
	ClearRecap(ctx context.Context, channelID string) error
}

// Poster abstracts sending a built message to a Discord channel. Implemented by
// discordgo's session.ChannelMessageSendComplex; faked in tests.
type Poster interface {
	// Post sends the message. status mirrors the Node fetch result so the loop
	// can log 403/404 (bot lacks access) distinctly. err is for transport errors.
	Post(ctx context.Context, channelID string, msg *discordgo.MessageSend) (status int, err error)
}

// embedColor is 0xf59e0b (amber) from index.ts.
const embedColor = 0xf59e0b

// medals for the top-3 completed players (index.ts `medals`).
var medals = []string{"\U0001F947", "\U0001F948", "\U0001F949"} // 🥇🥈🥉

// buildRecapEmbed reproduces the embed construction in index.ts exactly,
// including ranking (completed sorted by moves asc — the Repo provides that
// ordering), medals, ratings, the "did not finish" line, and the optional
// "Play today's puzzle" link. participants is the full, moves-asc list.
//
// Returns nil when there are no participants (caller just clears the schedule),
// matching the Node `if (participants.length === 0)` early-out.
func buildRecapEmbed(participants []Participant, dateKey, guildID, appID, siteURL string) *discordgo.MessageEmbed {
	if len(participants) == 0 {
		return nil
	}

	meta := computePuzzleMeta(dateKey)

	var completed, playing []Participant
	for _, p := range participants {
		switch p.Status {
		case "completed":
			completed = append(completed, p)
		case "playing":
			playing = append(playing, p)
		}
	}

	var lines []string
	for i, p := range completed {
		medal := "▪️" // ▪️ for 4th place onward
		if i < len(medals) {
			medal = medals[i]
		}
		emoji := "\U0001F4A1" // 💡 default
		if p.RatingEmoji != nil && *p.RatingEmoji != "" {
			emoji = *p.RatingEmoji
		}
		moves := 0
		if p.Moves != nil {
			moves = *p.Moves
		}
		line := fmt.Sprintf("%s **%s** — %s %d move%s", medal, p.Username, emoji, moves, plural(moves))
		if p.RatingLabel != nil && *p.RatingLabel != "" {
			line += fmt.Sprintf(" (%s)", *p.RatingLabel)
		}
		lines = append(lines, line)
	}

	if len(playing) > 0 {
		lines = append(lines, fmt.Sprintf("\U0001F3F3️ %d player%s did not finish", len(playing), plural(len(playing))))
	}

	// Header line: "**dateKey** · shapeLabel[ · Optimal: N moves]".
	header := fmt.Sprintf("**%s** · %s", dateKey, meta.shapeLabel)
	if meta.optimal >= 0 {
		header += fmt.Sprintf(" · Optimal: %d moves", meta.optimal)
	}

	descParts := []string{
		header,
		"",
		fmt.Sprintf("**%d** player%s attempted yesterday’s puzzle:", len(participants), plural(len(participants))),
		"",
	}
	descParts = append(descParts, lines...)
	descParts = append(descParts, "")

	// launchUrl = APP_ID ? `https://discord.com/activities/${APP_ID}` : null.
	if appID != "" {
		descParts = append(descParts, fmt.Sprintf("[▶️ Play today’s puzzle](https://discord.com/activities/%s)", appID))
	}

	// Drop empty strings only when they are the *trailing* falsy entries Node
	// would filter — index.ts does `.filter(Boolean)` over the whole array,
	// which removes ALL empty lines. Reproduce that exactly.
	description := strings.Join(filterNonEmpty(descParts), "\n")

	recapImgURL := activityImageURL(siteURL, guildID, dateKey)

	return &discordgo.MessageEmbed{
		Title:       "\U0001F526 Lights Out — Daily Recap", // 🔦
		Description: description,
		Color:       embedColor,
		Image:       &discordgo.MessageEmbedImage{URL: recapImgURL},
		Footer:      &discordgo.MessageEmbedFooter{Text: "Lights Out · Daily Puzzle"},
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
	}
}

// plural returns "s" unless n == 1, matching the Node `move${n !== 1 ? 's' : ”}`.
func plural(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

// filterNonEmpty drops empty strings, reproducing index.ts `.filter(Boolean)`.
func filterNonEmpty(in []string) []string {
	out := in[:0:0]
	for _, s := range in {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// activityImageURL builds the web app's activity-image URL the same way the Node
// runner does (replicating the SITE_URL + query-string construction).
func activityImageURL(siteURL, guildID, dateKey string) string {
	return siteURL + "/api/discord/activity-image?type=leaderboard&guildId=" +
		guildID + "&dateKey=" + dateKey + "&recap=1"
}
