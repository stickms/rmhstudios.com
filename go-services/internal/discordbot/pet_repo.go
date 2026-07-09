// pet_repo.go is the persistence layer for the Alex tamagotchi: raw pgx access
// to the discord_alex_pet (one row per guild) and discord_alex_caretaker (one row
// per guild+user) tables, plus the shared xAI image-spend budget reservation.
//
// All queries are parameterized (no string interpolation of user input) and every
// write is an idempotent upsert, so concurrent commands from the same guild
// converge instead of corrupting state. The service layer additionally serializes
// per-guild mutations with a mutex to make the read-modify-write cycle atomic.
package discordbot

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rmhstudios/rmh-go/pkg/db"
)

// petRepo owns DB access for the tamagotchi. A nil *db.DB (no database
// configured) makes every method a safe no-op / not-found so the bot degrades
// gracefully in local/dev runs without Postgres.
type petRepo struct {
	db *db.DB
}

func newPetRepo(database *db.DB) *petRepo { return &petRepo{db: database} }

// petColumns is the canonical column list, shared by SELECT/INSERT so the scan
// order can never drift from the query.
const petColumns = `"guildId","name","generation","bornAt","hunger","happiness","energy","hygiene","health","intelligence","alive","lifeStage","career","statsUpdatedAt","lastInteractionAt","lastChannelId","lastFedAt","lastPlayedAt","lastCleanedAt","lastSleptAt","lastStudiedAt","lastChatAt","lastCareAlertAt","lastAmbientAt","diedAt","introSentAt","createdAt","updatedAt"`

// scanPet reads a full pet row (from QueryRow or Rows) into a PetState.
func scanPet(row pgx.Row) (*PetState, error) {
	p := &PetState{}
	var lastChannel *string
	var career *string
	var lifeStage string // scan TEXT into a plain string, not the named type
	if err := row.Scan(
		&p.GuildID, &p.Name, &p.Generation, &p.BornAt,
		&p.Hunger, &p.Happiness, &p.Energy, &p.Hygiene, &p.Health, &p.Intelligence,
		&p.Alive, &lifeStage, &career,
		&p.StatsUpdatedAt, &p.LastInteractionAt, &lastChannel,
		&p.LastFedAt, &p.LastPlayedAt, &p.LastCleanedAt, &p.LastSleptAt, &p.LastStudiedAt, &p.LastChatAt,
		&p.LastCareAlertAt, &p.LastAmbientAt, &p.DiedAt, &p.IntroSentAt,
		&p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	p.LifeStage = LifeStage(lifeStage)
	if lastChannel != nil {
		p.LastChannelID = *lastChannel
	}
	if career != nil {
		p.Career = *career
	}
	return p, nil
}

// load fetches a guild's pet, returning (nil, false, nil) when it doesn't exist.
func (r *petRepo) load(ctx context.Context, guildID string) (*PetState, bool, error) {
	if r.db == nil {
		return nil, false, nil
	}
	row := r.db.Pool.QueryRow(ctx,
		`SELECT `+petColumns+` FROM "discord_alex_pet" WHERE "guildId"=$1`, guildID)
	p, err := scanPet(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return p, true, nil
}

// save upserts the pet row by guildId.
func (r *petRepo) save(ctx context.Context, p *PetState) error {
	if r.db == nil {
		return nil
	}
	p.UpdatedAt = time.Now().UTC()
	var lastChannel *string
	if p.LastChannelID != "" {
		lastChannel = &p.LastChannelID
	}
	var career *string
	if p.Career != "" {
		career = &p.Career
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_pet" (`+petColumns+`)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
		 ON CONFLICT ("guildId") DO UPDATE SET
		   "name"=EXCLUDED."name",
		   "generation"=EXCLUDED."generation",
		   "bornAt"=EXCLUDED."bornAt",
		   "hunger"=EXCLUDED."hunger",
		   "happiness"=EXCLUDED."happiness",
		   "energy"=EXCLUDED."energy",
		   "hygiene"=EXCLUDED."hygiene",
		   "health"=EXCLUDED."health",
		   "intelligence"=EXCLUDED."intelligence",
		   "alive"=EXCLUDED."alive",
		   "lifeStage"=EXCLUDED."lifeStage",
		   "career"=EXCLUDED."career",
		   "statsUpdatedAt"=EXCLUDED."statsUpdatedAt",
		   "lastInteractionAt"=EXCLUDED."lastInteractionAt",
		   "lastChannelId"=EXCLUDED."lastChannelId",
		   "lastFedAt"=EXCLUDED."lastFedAt",
		   "lastPlayedAt"=EXCLUDED."lastPlayedAt",
		   "lastCleanedAt"=EXCLUDED."lastCleanedAt",
		   "lastSleptAt"=EXCLUDED."lastSleptAt",
		   "lastStudiedAt"=EXCLUDED."lastStudiedAt",
		   "lastChatAt"=EXCLUDED."lastChatAt",
		   "lastCareAlertAt"=EXCLUDED."lastCareAlertAt",
		   "lastAmbientAt"=EXCLUDED."lastAmbientAt",
		   "diedAt"=EXCLUDED."diedAt",
		   "introSentAt"=EXCLUDED."introSentAt",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		p.GuildID, p.Name, p.Generation, p.BornAt,
		p.Hunger, p.Happiness, p.Energy, p.Hygiene, p.Health, p.Intelligence,
		p.Alive, string(p.LifeStage), career,
		p.StatsUpdatedAt, p.LastInteractionAt, lastChannel,
		p.LastFedAt, p.LastPlayedAt, p.LastCleanedAt, p.LastSleptAt, p.LastStudiedAt, p.LastChatAt,
		p.LastCareAlertAt, p.LastAmbientAt, p.DiedAt, p.IntroSentAt,
		p.CreatedAt, p.UpdatedAt,
	)
	return err
}

// ─── Per-guild bookkeeping for the global Alex (discord_alex_guild) ──────
//
// The pet itself is global, but Alex still needs to know which channel to talk in
// for each server he's in, and whether he's already introduced himself there.
// That per-guild state lives here, decoupled from the singleton pet.

// Proactive-message levels for a server (discord_alex_guild.messageLevel).
const (
	msgLevelAll  = "all"  // ambient + care alerts + life events (default)
	msgLevelCare = "care" // care alerts + life events only (no random ambient)
	msgLevelOff  = "off"  // completely silent
)

// GuildChannel is a server + the channel Alex last spoke / was used in there,
// plus that server's proactive-message level.
type GuildChannel struct {
	GuildID      string
	ChannelID    string
	MessageLevel string
}

// recordGuildChannel remembers the channel a command was last used in for a
// guild (best-effort; leaves introSentAt untouched).
func (r *petRepo) recordGuildChannel(ctx context.Context, guildID, channelID string) error {
	if r.db == nil || guildID == "" || channelID == "" {
		return nil
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_guild" ("guildId","lastChannelId","updatedAt")
		 VALUES ($1,$2,$3)
		 ON CONFLICT ("guildId") DO UPDATE SET
		   "lastChannelId"=EXCLUDED."lastChannelId",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		guildID, channelID, time.Now().UTC())
	return err
}

// clearGuildChannel forgets a guild's channel (used when Alex can no longer post
// there), leaving the intro flag intact.
func (r *petRepo) clearGuildChannel(ctx context.Context, guildID string) error {
	if r.db == nil {
		return nil
	}
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE "discord_alex_guild" SET "lastChannelId"=NULL, "updatedAt"=$2 WHERE "guildId"=$1`,
		guildID, time.Now().UTC())
	return err
}

// guildIntroSent reports whether Alex has already introduced himself in a guild.
func (r *petRepo) guildIntroSent(ctx context.Context, guildID string) (bool, error) {
	if r.db == nil {
		return false, nil
	}
	var sentAt *time.Time
	err := r.db.Pool.QueryRow(ctx,
		`SELECT "introSentAt" FROM "discord_alex_guild" WHERE "guildId"=$1`, guildID).Scan(&sentAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return sentAt != nil, nil
}

// markGuildIntro records that the intro has been sent in a guild and stores the
// channel it went to.
func (r *petRepo) markGuildIntro(ctx context.Context, guildID, channelID string) error {
	if r.db == nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_guild" ("guildId","lastChannelId","introSentAt","updatedAt")
		 VALUES ($1,$2,$3,$4)
		 ON CONFLICT ("guildId") DO UPDATE SET
		   "lastChannelId"=EXCLUDED."lastChannelId",
		   "introSentAt"=EXCLUDED."introSentAt",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		guildID, channelID, now, now)
	return err
}

// allGuildChannels returns every guild that has a channel Alex can broadcast to,
// with its ambient-posts preference.
func (r *petRepo) allGuildChannels(ctx context.Context) ([]GuildChannel, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "guildId","lastChannelId","messageLevel" FROM "discord_alex_guild" WHERE "lastChannelId" IS NOT NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GuildChannel
	for rows.Next() {
		var g GuildChannel
		if err := rows.Scan(&g.GuildID, &g.ChannelID, &g.MessageLevel); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// guildMessageLevel returns a guild's proactive-message level, defaulting to
// "all" when the guild has no row yet.
func (r *petRepo) guildMessageLevel(ctx context.Context, guildID string) (string, error) {
	if r.db == nil {
		return msgLevelAll, nil
	}
	var level string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT "messageLevel" FROM "discord_alex_guild" WHERE "guildId"=$1`, guildID).Scan(&level)
	if errors.Is(err, pgx.ErrNoRows) {
		return msgLevelAll, nil
	}
	if err != nil {
		return msgLevelAll, err
	}
	return level, nil
}

// setGuildMessageLevel sets a guild's proactive-message level, upserting the row.
// A non-empty channelID is also recorded (so a freshly-configured server is in the
// broadcast set); an empty one leaves any existing channel untouched.
func (r *petRepo) setGuildMessageLevel(ctx context.Context, guildID, channelID, level string) error {
	if r.db == nil {
		return nil
	}
	var channel *string
	if channelID != "" {
		channel = &channelID
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_guild" ("guildId","lastChannelId","messageLevel","updatedAt")
		 VALUES ($1,$2,$3,$4)
		 ON CONFLICT ("guildId") DO UPDATE SET
		   "messageLevel"=EXCLUDED."messageLevel",
		   "lastChannelId"=COALESCE(EXCLUDED."lastChannelId", "discord_alex_guild"."lastChannelId"),
		   "updatedAt"=EXCLUDED."updatedAt"`,
		guildID, channel, level, time.Now().UTC())
	return err
}

// guildCustomPrompt returns a guild's custom Alex persona prompt, or "" when the
// guild has none set (→ Alex uses his built-in default persona).
func (r *petRepo) guildCustomPrompt(ctx context.Context, guildID string) (string, error) {
	if r.db == nil || guildID == "" {
		return "", nil
	}
	var prompt *string
	err := r.db.Pool.QueryRow(ctx,
		`SELECT "customPrompt" FROM "discord_alex_guild" WHERE "guildId"=$1`, guildID).Scan(&prompt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if prompt == nil {
		return "", nil
	}
	return *prompt, nil
}

// setGuildCustomPrompt sets (or, with an empty prompt, clears → NULL) a guild's
// custom Alex persona prompt, upserting the row. Leaves the guild's channel and
// message-level settings untouched.
func (r *petRepo) setGuildCustomPrompt(ctx context.Context, guildID, prompt string) error {
	if r.db == nil || guildID == "" {
		return nil
	}
	var value *string
	if prompt != "" {
		value = &prompt
	}
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_guild" ("guildId","customPrompt","updatedAt")
		 VALUES ($1,$2,$3)
		 ON CONFLICT ("guildId") DO UPDATE SET
		   "customPrompt"=EXCLUDED."customPrompt",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		guildID, value, time.Now().UTC())
	return err
}

// ─── Caretaker leaderboard ──────────────────────────────────────────────

// CaretakerRow is one entry in a guild's caretaker leaderboard.
type CaretakerRow struct {
	UserID       string
	Username     string
	Feeds        int
	Plays        int
	Cleans       int
	Naps         int
	Talks        int
	Studies      int
	Interactions int
	Points       int
}

// careColumn maps an action's care key to its counter column. Whitelisted so the
// column name can never come from untrusted input.
var careColumn = map[string]string{
	"feeds":        `"feeds"`,
	"plays":        `"plays"`,
	"cleans":       `"cleans"`,
	"naps":         `"naps"`,
	"talks":        `"talks"`,
	"studies":      `"studies"`,
	"interactions": `"interactions"`,
}

// bumpCaretaker increments a caretaker's action counter and points, and records
// their avatar hash (for the rendered leaderboard). `care` MUST be a key in
// careColumn (validated here); anything else is a no-op.
func (r *petRepo) bumpCaretaker(ctx context.Context, guildID, userID, username, avatarHash, care string, points int) error {
	if r.db == nil {
		return nil
	}
	col, ok := careColumn[care]
	if !ok {
		return nil
	}
	var avatar *string
	if avatarHash != "" {
		avatar = &avatarHash
	}
	// The column is chosen from a fixed whitelist above, never interpolated from
	// user input — safe against injection.
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_caretaker" ("guildId","userId","username","avatarHash",`+col+`,"points","updatedAt")
		 VALUES ($1,$2,$3,$4,1,$5,$6)
		 ON CONFLICT ("guildId","userId") DO UPDATE SET
		   "username"=EXCLUDED."username",
		   "avatarHash"=COALESCE(EXCLUDED."avatarHash", "discord_alex_caretaker"."avatarHash"),
		   `+col+`="discord_alex_caretaker".`+col+`+1,
		   "points"="discord_alex_caretaker"."points"+$5,
		   "updatedAt"=EXCLUDED."updatedAt"`,
		guildID, userID, username, avatar, points, time.Now().UTC())
	return err
}

// topCaretakers returns the guild's highest-point caretakers, best first.
func (r *petRepo) topCaretakers(ctx context.Context, guildID string, limit int) ([]CaretakerRow, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "userId","username","feeds","plays","cleans","naps","talks","studies","interactions","points"
		   FROM "discord_alex_caretaker" WHERE "guildId"=$1
		   ORDER BY "points" DESC, "updatedAt" ASC LIMIT $2`, guildID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CaretakerRow
	for rows.Next() {
		var c CaretakerRow
		if err := rows.Scan(&c.UserID, &c.Username, &c.Feeds, &c.Plays, &c.Cleans, &c.Naps, &c.Talks, &c.Studies, &c.Interactions, &c.Points); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// setCaretakerAvatar refreshes a caretaker's stored avatar hash (best-effort;
// a no-op for a user with no row). An empty hash clears it (→ default avatar).
func (r *petRepo) setCaretakerAvatar(ctx context.Context, guildID, userID, avatarHash string) error {
	if r.db == nil {
		return nil
	}
	var avatar *string
	if avatarHash != "" {
		avatar = &avatarHash
	}
	_, err := r.db.Pool.Exec(ctx,
		`UPDATE "discord_alex_caretaker" SET "avatarHash"=$3 WHERE "guildId"=$1 AND "userId"=$2`,
		guildID, userID, avatar)
	return err
}

// ─── Shared image-spend budget (mirrors botworker/image-budget) ─────────

// reserveImageBudgetQuery atomically reserves one unit of today's global image
// budget, returning the new count iff still under cap. Identical form to the
// bot-worker's so the two processes share one daily ceiling.
const petReserveImageBudgetQuery = `
INSERT INTO "image_gen_budget" (day, count) VALUES ($1, 1)
ON CONFLICT (day) DO UPDATE
  SET count = "image_gen_budget".count + 1
  WHERE "image_gen_budget".count < $2
RETURNING count`

// reserveImageBudget reserves one image-generation unit. Fails closed (false) on
// any DB error so we never overspend the xAI credit balance.
func (r *petRepo) reserveImageBudget(ctx context.Context, day string, capLimit int) (bool, error) {
	if r.db == nil {
		return false, nil
	}
	var count int
	err := r.db.Pool.QueryRow(ctx, petReserveImageBudgetQuery, day, capLimit).Scan(&count)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil // at cap
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
