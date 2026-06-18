package recap

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"

	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// checkInterval ports CHECK_INTERVAL_MS = 5 * 60 * 1000.
const checkInterval = 5 * time.Minute

// Runner is the recap scheduler. It owns the 5-minute due-recap loop and the
// Discord gateway presence connection, mirroring server/recap/index.ts.
type Runner struct {
	repo    Repo
	poster  Poster
	log     *log.Logger
	metrics *telemetry.Metrics

	appID   string
	siteURL string

	session *discordgo.Session // gateway connection for "online" presence

	wg   sync.WaitGroup
	stop chan struct{}
	once sync.Once
}

// Config holds the env-derived settings (see cmd/recap/main.go).
type Config struct {
	BotToken string // DISCORD_ACTIVITY_BOT_TOKEN
	AppID    string // VITE_DISCORD_ACTIVITY_CLIENT_ID (fallback DISCORD_ACTIVITY_CLIENT_ID)
	SiteURL  string // SITE_URL (trailing slash stripped)
}

// New builds a Runner with the production Repo (pgx) and Poster (discordgo).
// session may be nil when no bot token is configured.
func New(database *db.DB, session *discordgo.Session, cfg Config, logger *log.Logger, metrics *telemetry.Metrics) *Runner {
	return &Runner{
		repo:    &pgRepo{db: database, metrics: metrics},
		poster:  &discordPoster{session: session},
		log:     logger,
		metrics: metrics,
		appID:   cfg.AppID,
		siteURL: cfg.SiteURL,
		session: session,
		stop:    make(chan struct{}),
	}
}

// Start opens the gateway presence connection and launches the recap loop.
//
// Improvement over the Node runner: discordgo's session.Open() manages the
// gateway handshake, heartbeats, reconnect, and RESUME for us — so we no longer
// hand-roll the op-10/op-1/op-7/op-9 logic, the heartbeat setInterval, or the
// 30s reconnect timer that index.ts had to maintain.
func (r *Runner) Start(ctx context.Context) {
	if r.session != nil {
		// Presence is configured via the session's Identify before Open (set in
		// cmd/recap/main.go). Open blocks only until the gateway is ready.
		if err := r.session.Open(); err != nil {
			r.log.Error("gateway open failed", "error", err)
		} else {
			r.log.Info("gateway connected — bot is online")
		}
	}

	// Initial recap check (Node runs processDueRecaps() once before the interval).
	r.runOnce(ctx)

	r.wg.Add(1)
	go r.loop(ctx)

	r.log.Info("recap runner started", "interval", checkInterval.String())
}

// Stop drains the loop and closes the gateway connection.
func (r *Runner) Stop() {
	r.once.Do(func() { close(r.stop) })
	r.wg.Wait()
	if r.session != nil {
		if err := r.session.Close(); err != nil {
			r.log.Warn("gateway close failed", "error", err)
		}
	}
	r.log.Info("recap runner stopped")
}

func (r *Runner) loop(ctx context.Context) {
	defer r.wg.Done()
	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stop:
			return
		case <-ticker.C:
			r.runOnce(ctx)
		}
	}
}

// runOnce wraps processDueRecaps with job metrics, mirroring the Node
// `processDueRecaps().catch(...)`.
func (r *Runner) runOnce(ctx context.Context) {
	if err := r.processDueRecaps(ctx); err != nil {
		r.metrics.JobRuns.WithLabelValues("recap", "error").Inc()
		r.log.Error("recap run failed", "error", err)
		return
	}
	r.metrics.JobRuns.WithLabelValues("recap", "ok").Inc()
}

// processDueRecaps ports the Node processDueRecaps(): find due channels, build &
// post the embed for each, then clear the schedule (always, even on 403/404).
func (r *Runner) processDueRecaps(ctx context.Context) error {
	channels, err := r.repo.DueChannels(ctx, time.Now())
	if err != nil {
		return err
	}
	if len(channels) == 0 {
		return nil
	}
	r.log.Info("found due recaps", "count", len(channels))

	for _, ch := range channels {
		if err := r.processOne(ctx, ch); err != nil {
			// Match Node: log per-guild failure, keep going.
			r.log.Error("recap failed for guild", "guildId", ch.GuildID, "error", err)
		}
	}
	return nil
}

// processOne handles a single due channel.
func (r *Runner) processOne(ctx context.Context, ch DueChannel) error {
	participants, err := r.repo.Participants(ctx, ch.GuildID, ch.RecapDateKey)
	if err != nil {
		return err
	}

	// No participants: just clear the schedule (Node early-out).
	if len(participants) == 0 {
		return r.repo.ClearRecap(ctx, ch.ID)
	}

	embed := buildRecapEmbed(participants, ch.RecapDateKey, ch.GuildID, r.appID, r.siteURL)
	if embed == nil {
		return r.repo.ClearRecap(ctx, ch.ID)
	}

	msg := &discordgo.MessageSend{Embeds: []*discordgo.MessageEmbed{embed}}
	status, postErr := r.poster.Post(ctx, ch.ChannelID, msg)
	switch {
	case postErr != nil:
		// Transport error — log but still clear (Node clears unconditionally).
		r.log.Warn("recap post error", "guildId", ch.GuildID, "error", postErr)
	case status == 403 || status == 404:
		r.log.Info("bot lacks access — clearing recap", "guildId", ch.GuildID, "status", status)
	default:
		r.log.Info("posted recap", "guildId", ch.GuildID, "channelId", ch.ChannelID)
	}

	// Always clear the recap schedule (faithful to the Node comment).
	return r.repo.ClearRecap(ctx, ch.ID)
}

// ─── production Repo (pgx) ───────────────────────────────────────────────────

type pgRepo struct {
	db      *db.DB
	metrics *telemetry.Metrics
}

func (p *pgRepo) DueChannels(ctx context.Context, now time.Time) ([]DueChannel, error) {
	rows, err := p.db.Pool.Query(ctx,
		`SELECT "id", "guildId", "channelId", "recapDateKey"
		   FROM "discord_activity_channel"
		  WHERE "activity" = 'lights-out'
		    AND "recapDueAt" IS NOT NULL
		    AND "recapDueAt" <= $1
		    AND "recapDateKey" IS NOT NULL`,
		now,
	)
	if err != nil {
		p.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	defer rows.Close()

	var out []DueChannel
	for rows.Next() {
		var c DueChannel
		var dateKey *string
		if err := rows.Scan(&c.ID, &c.GuildID, &c.ChannelID, &dateKey); err != nil {
			p.metrics.DBQueries.WithLabelValues("error").Inc()
			return nil, err
		}
		if dateKey != nil {
			c.RecapDateKey = *dateKey
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		p.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	p.metrics.DBQueries.WithLabelValues("ok").Inc()
	return out, nil
}

func (p *pgRepo) Participants(ctx context.Context, guildID, dateKey string) ([]Participant, error) {
	// ORDER BY "moves" ASC NULLS LAST keeps completed (lowest moves) first while
	// still returning players with NULL moves. Node's Prisma orderBy moves:'asc'
	// places nulls last on Postgres.
	rows, err := p.db.Pool.Query(ctx,
		`SELECT "username", "status", "moves", "ratingEmoji", "ratingLabel"
		   FROM "discord_daily_participant"
		  WHERE "guildId" = $1 AND "dateKey" = $2
		  ORDER BY "moves" ASC NULLS LAST`,
		guildID, dateKey,
	)
	if err != nil {
		p.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	defer rows.Close()

	var out []Participant
	for rows.Next() {
		var pt Participant
		var moves *int32
		if err := rows.Scan(&pt.Username, &pt.Status, &moves, &pt.RatingEmoji, &pt.RatingLabel); err != nil {
			p.metrics.DBQueries.WithLabelValues("error").Inc()
			return nil, err
		}
		if moves != nil {
			m := int(*moves)
			pt.Moves = &m
		}
		out = append(out, pt)
	}
	if err := rows.Err(); err != nil {
		p.metrics.DBQueries.WithLabelValues("error").Inc()
		return nil, err
	}
	p.metrics.DBQueries.WithLabelValues("ok").Inc()
	return out, nil
}

func (p *pgRepo) ClearRecap(ctx context.Context, channelID string) error {
	_, err := p.db.Pool.Exec(ctx,
		`UPDATE "discord_activity_channel"
		    SET "recapDateKey" = NULL, "recapDueAt" = NULL
		  WHERE "id" = $1`,
		channelID,
	)
	if err != nil {
		p.metrics.DBQueries.WithLabelValues("error").Inc()
		return err
	}
	p.metrics.DBQueries.WithLabelValues("ok").Inc()
	return nil
}

// ─── production Poster (discordgo) ───────────────────────────────────────────

type discordPoster struct {
	session *discordgo.Session
}

// Post sends the message via session.ChannelMessageSendComplex. discordgo
// surfaces HTTP errors as *discordgo.RESTError, from which we recover the status
// code so the loop can treat 403/404 (bot not in guild / channel gone) as a
// non-fatal skip, exactly like the Node runner.
func (d *discordPoster) Post(ctx context.Context, channelID string, msg *discordgo.MessageSend) (int, error) {
	if d.session == nil {
		// No bot token configured — mirror the Node `if (!BOT_TOKEN) return null`.
		return 0, nil
	}
	_, err := d.session.ChannelMessageSendComplex(channelID, msg, discordgo.WithContext(ctx))
	if err != nil {
		var rest *discordgo.RESTError
		if errors.As(err, &rest) && rest.Response != nil {
			return rest.Response.StatusCode, nil
		}
		return 0, err
	}
	return 200, nil
}
