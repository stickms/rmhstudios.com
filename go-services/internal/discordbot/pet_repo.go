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
const petColumns = `"guildId","name","generation","bornAt","hunger","happiness","energy","hygiene","health","alive","lifeStage","statsUpdatedAt","lastInteractionAt","lastChannelId","lastFedAt","lastPlayedAt","lastCleanedAt","lastSleptAt","lastChatAt","lastCareAlertAt","lastAmbientAt","diedAt","createdAt","updatedAt"`

// scanPet reads a full pet row (from QueryRow or Rows) into a PetState.
func scanPet(row pgx.Row) (*PetState, error) {
	p := &PetState{}
	var lastChannel *string
	var lifeStage string // scan TEXT into a plain string, not the named type
	if err := row.Scan(
		&p.GuildID, &p.Name, &p.Generation, &p.BornAt,
		&p.Hunger, &p.Happiness, &p.Energy, &p.Hygiene, &p.Health,
		&p.Alive, &lifeStage,
		&p.StatsUpdatedAt, &p.LastInteractionAt, &lastChannel,
		&p.LastFedAt, &p.LastPlayedAt, &p.LastCleanedAt, &p.LastSleptAt, &p.LastChatAt,
		&p.LastCareAlertAt, &p.LastAmbientAt, &p.DiedAt,
		&p.CreatedAt, &p.UpdatedAt,
	); err != nil {
		return nil, err
	}
	p.LifeStage = LifeStage(lifeStage)
	if lastChannel != nil {
		p.LastChannelID = *lastChannel
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
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_pet" (`+petColumns+`)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
		 ON CONFLICT ("guildId") DO UPDATE SET
		   "name"=EXCLUDED."name",
		   "generation"=EXCLUDED."generation",
		   "bornAt"=EXCLUDED."bornAt",
		   "hunger"=EXCLUDED."hunger",
		   "happiness"=EXCLUDED."happiness",
		   "energy"=EXCLUDED."energy",
		   "hygiene"=EXCLUDED."hygiene",
		   "health"=EXCLUDED."health",
		   "alive"=EXCLUDED."alive",
		   "lifeStage"=EXCLUDED."lifeStage",
		   "statsUpdatedAt"=EXCLUDED."statsUpdatedAt",
		   "lastInteractionAt"=EXCLUDED."lastInteractionAt",
		   "lastChannelId"=EXCLUDED."lastChannelId",
		   "lastFedAt"=EXCLUDED."lastFedAt",
		   "lastPlayedAt"=EXCLUDED."lastPlayedAt",
		   "lastCleanedAt"=EXCLUDED."lastCleanedAt",
		   "lastSleptAt"=EXCLUDED."lastSleptAt",
		   "lastChatAt"=EXCLUDED."lastChatAt",
		   "lastCareAlertAt"=EXCLUDED."lastCareAlertAt",
		   "lastAmbientAt"=EXCLUDED."lastAmbientAt",
		   "diedAt"=EXCLUDED."diedAt",
		   "updatedAt"=EXCLUDED."updatedAt"`,
		p.GuildID, p.Name, p.Generation, p.BornAt,
		p.Hunger, p.Happiness, p.Energy, p.Hygiene, p.Health,
		p.Alive, string(p.LifeStage),
		p.StatsUpdatedAt, p.LastInteractionAt, lastChannel,
		p.LastFedAt, p.LastPlayedAt, p.LastCleanedAt, p.LastSleptAt, p.LastChatAt,
		p.LastCareAlertAt, p.LastAmbientAt, p.DiedAt,
		p.CreatedAt, p.UpdatedAt,
	)
	return err
}

// allPets returns every guild's pet (for the background caretaking loop). Only
// pets that have a known channel to talk in are worth loading, but we filter in
// the loop so a pet whose channel is set later still gets picked up.
func (r *petRepo) allPets(ctx context.Context) ([]*PetState, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx, `SELECT `+petColumns+` FROM "discord_alex_pet"`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*PetState
	for rows.Next() {
		p, err := scanPet(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ─── Caretaker leaderboard ──────────────────────────────────────────────

// CaretakerRow is one entry in a guild's caretaker leaderboard.
type CaretakerRow struct {
	UserID   string
	Username string
	Feeds    int
	Plays    int
	Cleans   int
	Naps     int
	Talks    int
	Points   int
}

// careColumn maps an action's care key to its counter column. Whitelisted so the
// column name can never come from untrusted input.
var careColumn = map[string]string{
	"feeds":  `"feeds"`,
	"plays":  `"plays"`,
	"cleans": `"cleans"`,
	"naps":   `"naps"`,
	"talks":  `"talks"`,
}

// bumpCaretaker increments a caretaker's action counter and points. `care` MUST
// be a key in careColumn (validated here); anything else is a no-op.
func (r *petRepo) bumpCaretaker(ctx context.Context, guildID, userID, username, care string, points int) error {
	if r.db == nil {
		return nil
	}
	col, ok := careColumn[care]
	if !ok {
		return nil
	}
	// The column is chosen from a fixed whitelist above, never interpolated from
	// user input — safe against injection.
	_, err := r.db.Pool.Exec(ctx,
		`INSERT INTO "discord_alex_caretaker" ("guildId","userId","username",`+col+`,"points","updatedAt")
		 VALUES ($1,$2,$3,1,$4,$5)
		 ON CONFLICT ("guildId","userId") DO UPDATE SET
		   "username"=EXCLUDED."username",
		   `+col+`="discord_alex_caretaker".`+col+`+1,
		   "points"="discord_alex_caretaker"."points"+$4,
		   "updatedAt"=EXCLUDED."updatedAt"`,
		guildID, userID, username, points, time.Now().UTC())
	return err
}

// topCaretakers returns the guild's highest-point caretakers, best first.
func (r *petRepo) topCaretakers(ctx context.Context, guildID string, limit int) ([]CaretakerRow, error) {
	if r.db == nil {
		return nil, nil
	}
	rows, err := r.db.Pool.Query(ctx,
		`SELECT "userId","username","feeds","plays","cleans","naps","talks","points"
		   FROM "discord_alex_caretaker" WHERE "guildId"=$1
		   ORDER BY "points" DESC, "updatedAt" ASC LIMIT $2`, guildID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CaretakerRow
	for rows.Next() {
		var c CaretakerRow
		if err := rows.Scan(&c.UserID, &c.Username, &c.Feeds, &c.Plays, &c.Cleans, &c.Naps, &c.Talks, &c.Points); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
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
