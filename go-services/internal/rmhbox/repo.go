package rmhbox

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ─── Persistence layer ───────────────────────────────────────────────────────
//
// Port of leaderboard.ts persistMatchResults / onFetch, using raw pgx instead
// of Prisma. The DB sits behind the Repo interface so the coordinator and tests
// don't depend on a live database.

// MatchPlayerResult is a per-player row to persist alongside a match.
type MatchPlayerResult struct {
	UserID   string
	UserName string
	Rank     int
	Score    int
	Deltas   map[string]int
}

// MatchRecord is everything needed to persist one completed game.
type MatchRecord struct {
	MinigameID   string
	LobbyID      string
	StartedAt    time.Time
	EndedAt      time.Time
	DurationMS   int64
	WinnerUserID string // "" => null
	PlayerCount  int
	GameLog      json.RawMessage // may be nil
	Results      json.RawMessage
	Players      []MatchPlayerResult
}

// LeaderboardEntry is one row returned by ReadLeaderboard.
type LeaderboardEntry struct {
	Rank        int    `json:"rank"`
	UserID      string `json:"userId"`
	UserName    string `json:"userName"`
	AvatarURL   string `json:"avatarUrl"`
	Value       int    `json:"value"`
	GamesPlayed int    `json:"gamesPlayed"`
	Wins        int    `json:"wins"`
}

// Repo abstracts match/profile persistence.
type Repo interface {
	// PersistMatch writes the match, match-player rows, and atomically merges
	// each player's profile aggregates (incl. the minigameStats JSONB).
	PersistMatch(ctx context.Context, m MatchRecord) error
	// ReadLeaderboard returns the top profiles ordered by metric.
	ReadLeaderboard(ctx context.Context, metric string, limit int) ([]LeaderboardEntry, error)
}

// minigameStatEntry mirrors the per-game JSONB value in "minigameStats".
type minigameStatEntry struct {
	GamesPlayed int     `json:"gamesPlayed"`
	Wins        int     `json:"wins"`
	BestScore   int     `json:"bestScore"`
	TotalScore  int     `json:"totalScore"`
	TotalRank   int     `json:"totalRank"`
	AverageRank float64 `json:"averageRank"`
}

// mergeMinigameStats applies one match result to a player's per-game stats map.
// This is the read-modify-write step the Node code did unsafely; in Go it runs
// under a SELECT ... FOR UPDATE row lock inside the transaction (see
// upsertProfile), so concurrent matches for the same user can't clobber it.
// Extracted as a pure function so the merge math is unit-tested directly.
func mergeMinigameStats(cur map[string]minigameStatEntry, minigameID string, score, rank int, isWinner bool) map[string]minigameStatEntry {
	if cur == nil {
		cur = map[string]minigameStatEntry{}
	}
	e := cur[minigameID]
	e.GamesPlayed++
	if isWinner {
		e.Wins++
	}
	if score > e.BestScore {
		e.BestScore = score
	}
	e.TotalScore += score
	e.TotalRank += rank
	e.AverageRank = float64(e.TotalRank) / float64(e.GamesPlayed)
	cur[minigameID] = e
	return cur
}

// ─── pgx-backed Repo ─────────────────────────────────────────────────────────

type pgRepo struct{ pool *pgxpool.Pool }

// NewPGRepo builds a Repo backed by the given pgx pool.
func NewPGRepo(pool *pgxpool.Pool) Repo { return &pgRepo{pool: pool} }

func (r *pgRepo) PersistMatch(ctx context.Context, m MatchRecord) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var matchID string
	err = tx.QueryRow(ctx, `
		INSERT INTO "rmhbox_match"
		  ("minigameId","lobbyId","startedAt","endedAt","durationMs","winnerUserId","playerCount","gameLog","results")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING "id"`,
		m.MinigameID, m.LobbyID, m.StartedAt, m.EndedAt, m.DurationMS,
		nullString(m.WinnerUserID), m.PlayerCount, nullJSON(m.GameLog), jsonOrEmpty(m.Results),
	).Scan(&matchID)
	if err != nil {
		return err
	}

	for _, pr := range m.Players {
		isWinner := pr.Rank == 1
		profileID, err := r.upsertProfile(ctx, tx, m.MinigameID, pr, m.DurationMS, isWinner)
		if err != nil {
			return err
		}
		statsJSON, _ := json.Marshal(orEmptyDeltas(pr.Deltas))
		_, err = tx.Exec(ctx, `
			INSERT INTO "rmhbox_match_player"
			  ("matchId","profileId","userId","userName","rank","score","wasWinner","stats")
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			matchID, profileID, pr.UserID, pr.UserName, pr.Rank, pr.Score, isWinner, statsJSON,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// upsertProfile performs the read-modify-write of a player's profile aggregates
// ATOMICALLY. The Node code had a concurrency hazard (find-then-update without a
// lock, so two matches finishing for the same user could clobber minigameStats).
// Here we SELECT ... FOR UPDATE inside the transaction so the row is locked for
// the duration of the read-modify-write, then UPDATE in place.
func (r *pgRepo) upsertProfile(ctx context.Context, tx pgx.Tx, minigameID string, pr MatchPlayerResult, durationMS int64, isWinner bool) (string, error) {
	var (
		profileID  string
		statsRaw   []byte
		curStreak  int
		bestStreak int
	)
	err := tx.QueryRow(ctx, `
		SELECT "id","minigameStats","currentWinStreak","bestWinStreak"
		FROM "rmhbox_profile" WHERE "userId"=$1 FOR UPDATE`, pr.UserID,
	).Scan(&profileID, &statsRaw, &curStreak, &bestStreak)

	if err == pgx.ErrNoRows {
		// Create a fresh profile with this game's first stat entry.
		entry := minigameStatEntry{
			GamesPlayed: 1, Wins: boolToInt(isWinner), BestScore: pr.Score,
			TotalScore: pr.Score, TotalRank: pr.Rank, AverageRank: float64(pr.Rank),
		}
		stats := map[string]minigameStatEntry{minigameID: entry}
		statsJSON, _ := json.Marshal(stats)
		newStreak := boolToInt(isWinner)
		err = tx.QueryRow(ctx, `
			INSERT INTO "rmhbox_profile"
			  ("userId","totalGamesPlayed","totalWins","totalScore","totalPlayTimeMs",
			   "minigameStats","currentWinStreak","bestWinStreak","createdAt","updatedAt")
			VALUES ($1,1,$2,$3,$4,$5,$6,$6,now(),now())
			RETURNING "id"`,
			pr.UserID, boolToInt(isWinner), pr.Score, durationMS, statsJSON, newStreak,
		).Scan(&profileID)
		return profileID, err
	}
	if err != nil {
		return "", err
	}

	// Read-modify-write under the row lock (atomic via FOR UPDATE).
	stats := map[string]minigameStatEntry{}
	if len(statsRaw) > 0 {
		_ = json.Unmarshal(statsRaw, &stats)
	}
	stats = mergeMinigameStats(stats, minigameID, pr.Score, pr.Rank, isWinner)
	statsJSON, _ := json.Marshal(stats)

	newCurStreak := 0
	if isWinner {
		newCurStreak = curStreak + 1
	}
	newBestStreak := bestStreak
	if newCurStreak > newBestStreak {
		newBestStreak = newCurStreak
	}

	winInc := 0
	if isWinner {
		winInc = 1
	}
	_, err = tx.Exec(ctx, `
		UPDATE "rmhbox_profile" SET
		  "totalGamesPlayed"="totalGamesPlayed"+1,
		  "totalWins"="totalWins"+$2,
		  "totalScore"="totalScore"+$3,
		  "totalPlayTimeMs"="totalPlayTimeMs"+$4,
		  "minigameStats"=$5,
		  "currentWinStreak"=$6,
		  "bestWinStreak"=$7,
		  "updatedAt"=now()
		WHERE "id"=$1`,
		profileID, winInc, pr.Score, durationMS, statsJSON, newCurStreak, newBestStreak,
	)
	return profileID, err
}

func (r *pgRepo) ReadLeaderboard(ctx context.Context, metric string, limit int) ([]LeaderboardEntry, error) {
	// SAFETY: orderCol is concatenated into the SQL below, so it MUST only ever
	// be one of these hardcoded column literals. It is NOT derived from `metric`
	// directly — the switch maps the caller's metric onto a fixed whitelist of
	// quoted identifiers, so no user input reaches the query string. Any new
	// metric must be added here as another literal case (never pass metric
	// through). This keeps the ORDER BY injection-proof.
	orderCol := `"totalScore"`
	switch metric {
	case "wins":
		orderCol = `"totalWins"`
	case "games":
		orderCol = `"totalGamesPlayed"`
	}
	rows, err := r.pool.Query(ctx, `
		SELECT p."userId", COALESCE(u."name",'Unknown'), COALESCE(u."image",''),
		       p."totalScore", p."totalWins", p."totalGamesPlayed"
		FROM "rmhbox_profile" p
		LEFT JOIN "user" u ON u."id"=p."userId"
		ORDER BY p.`+orderCol+` DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LeaderboardEntry{}
	i := 0
	for rows.Next() {
		i++
		var e LeaderboardEntry
		var score, wins, games int
		if err := rows.Scan(&e.UserID, &e.UserName, &e.AvatarURL, &score, &wins, &games); err != nil {
			return nil, err
		}
		e.Rank = i
		e.GamesPlayed, e.Wins = games, wins
		switch metric {
		case "wins":
			e.Value = wins
		case "games":
			e.Value = games
		default:
			e.Value = score
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullJSON(b json.RawMessage) any {
	if len(b) == 0 {
		return nil
	}
	return []byte(b)
}

func jsonOrEmpty(b json.RawMessage) []byte {
	if len(b) == 0 {
		return []byte("[]")
	}
	return b
}

func orEmptyDeltas(m map[string]int) map[string]int {
	if m == nil {
		return map[string]int{}
	}
	return m
}
