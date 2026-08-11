package discordbot

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

// The weekly digest: the write-up, posted back into the server it is about.
//
// The page already has a weekly summary and a permalink for it. What it did not
// have was a way to reach anybody who is not already looking at it — and the
// audience for this dossier is a Discord server, not a browser tab. So once a
// week has ENDED and been written up, the digest goes to a configured channel
// with a link to the week's own page.
//
// # Idempotency
//
// `digestPostedAt` on the summary row, claimed with a conditional update BEFORE
// the post goes out. Two workers racing (or one restarting mid-pass) cannot both
// post: the second update matches zero rows. The cost of that ordering is that a
// post which fails after the claim is not retried — deliberately, because the
// alternative is a channel that gets the same digest five times when Discord is
// having a bad Monday, and a missed digest is much cheaper than that. (A
// transient failure DOES release the claim; see below.)
//
// # Why only completed weeks
//
// The summary for the current week is rewritten every pass as the figures move.
// Posting it would announce Monday's two hours as if they were the week, then
// have no way to correct it. A week is posted once it can no longer change.

// digestBackfillDays bounds how far back a first run will look.
//
// Without it, switching the feature on would post a digest for every week the
// tracker has ever summarised, in one burst, to a channel that was expecting
// one. Two weeks is enough to survive a long outage and short enough that the
// burst is a burst of two.
const digestBackfillDays = 14

// digestColor is the page's blurple, so the embed reads as the same artefact as
// the card it links to.
const digestColor = 0x5865f2

// postPendingDigests posts the write-up for any completed week that has not been
// announced yet. A no-op when no channel is configured, which is the default.
func (s *WatchSummarizer) postPendingDigests(ctx context.Context, session *discordgo.Session, now time.Time) {
	if s == nil || session == nil || s.cfg.DigestChannelID == "" {
		return
	}
	currentWeek := isoWeekKey(now.In(s.loc))
	oldest := isoWeekKey(now.In(s.loc).AddDate(0, 0, -digestBackfillDays))

	for _, discordID := range s.cfg.UserIDs {
		pending, err := s.repo.unpostedWeekSummaries(ctx, discordID, oldest)
		if err != nil {
			s.logger.Warn("watch: digest lookup", "userId", discordID, "error", err)
			continue
		}
		for _, summary := range pending {
			// The current week is still moving; it gets posted next Monday.
			if summary.PeriodKey >= currentWeek {
				continue
			}
			claimed, err := s.repo.claimDigest(ctx, discordID, summary.PeriodKey, now)
			if err != nil {
				s.logger.Warn("watch: digest claim", "periodKey", summary.PeriodKey, "error", err)
				continue
			}
			if !claimed {
				continue // another worker got there first
			}

			totals, err := s.weekTotals(ctx, discordID, summary.PeriodKey)
			if err != nil {
				s.logger.Warn("watch: digest totals", "periodKey", summary.PeriodKey, "error", err)
			}
			_, err = session.ChannelMessageSendComplex(s.cfg.DigestChannelID, &discordgo.MessageSend{
				// No pings, ever. This is a channel post about somebody, and an
				// @ on it would turn a running joke into a notification he
				// cannot mute.
				AllowedMentions: &discordgo.MessageAllowedMentions{Parse: []discordgo.AllowedMentionType{}},
				Embeds:          []*discordgo.MessageEmbed{buildDigestEmbed(summary, totals, s.cfg.SiteURL)},
			})
			if err != nil {
				s.logger.Warn("watch: digest post", "periodKey", summary.PeriodKey, "error", err)
				// Release the claim so a later pass can retry — but only for a
				// transient failure. A 403/404 means the channel is gone or the
				// bot cannot write to it, and retrying that every thirty minutes
				// forever is log noise and nothing else.
				if !permanentDiscordError(err) {
					if err := s.repo.releaseDigest(ctx, discordID, summary.PeriodKey); err != nil {
						s.logger.Warn("watch: digest release", "periodKey", summary.PeriodKey, "error", err)
					}
				}
				continue
			}
			s.logger.Info("watch: posted weekly digest", "userId", discordID, "periodKey", summary.PeriodKey)
		}
	}
}

// weekTotals folds the week's rollups, for the figures under the prose.
func (s *WatchSummarizer) weekTotals(ctx context.Context, discordID, periodKey string) (dayTotals, error) {
	fromKey, toKey, err := periodRange(periodWeek, periodKey, s.loc)
	if err != nil {
		return dayTotals{}, err
	}
	days, err := s.repo.daysInRange(ctx, discordID, fromKey, toKey)
	if err != nil {
		return dayTotals{}, err
	}
	return sumDays(days), nil
}

// buildDigestEmbed renders one week. Pure, so the layout is testable without a
// gateway or a database.
func buildDigestEmbed(summary *watchSummary, totals dayTotals, siteURL string) *discordgo.MessageEmbed {
	url := fmt.Sprintf("%s/sohumtracker/week/%s", strings.TrimRight(siteURL, "/"), summary.PeriodKey)

	description := summary.Summary
	if summary.Verdict != "" {
		description = fmt.Sprintf("%s\n\n*%s*", description, summary.Verdict)
	}

	embed := &discordgo.MessageEmbed{
		Title:       summary.Headline,
		URL:         url,
		Description: description,
		Color:       digestColor,
		Fields: []*discordgo.MessageEmbedField{
			{
				Name:   "Signed in",
				Value:  humanDuration(totals.OnlineSec + totals.IdleSec + totals.DndSec),
				Inline: true,
			},
			{Name: "In voice", Value: humanDuration(totals.VoiceSec), Inline: true},
			{Name: "Messages", Value: fmt.Sprintf("%d", totals.Messages), Inline: true},
			{Name: "In games", Value: humanDuration(totals.GamingSec), Inline: true},
			{Name: "On his phone", Value: humanDuration(totals.MobileSec), Inline: true},
			{
				// The figure this whole dossier is really about, stated last so
				// it is the line the eye stops on.
				Name:   "Mentioned looking for work",
				Value:  fmt.Sprintf("%d times", totals.JobMentions),
				Inline: true,
			},
		},
		Footer: &discordgo.MessageEmbedFooter{
			Text: fmt.Sprintf("Week %s · figures measured by rmhbot, prose generated", summary.PeriodKey),
		},
	}
	if len(summary.Topics) > 0 {
		embed.Fields = append(embed.Fields, &discordgo.MessageEmbedField{
			Name:  "Topics",
			Value: strings.Join(summary.Topics, " · "),
		})
	}
	return embed
}

// permanentDiscordError reports whether a send failure is worth never retrying.
func permanentDiscordError(err error) bool {
	var rest *discordgo.RESTError
	if !errors.As(err, &rest) || rest.Response == nil {
		return false
	}
	switch rest.Response.StatusCode {
	case 400, 401, 403, 404:
		return true
	}
	return false
}
