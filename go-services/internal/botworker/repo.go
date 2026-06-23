package botworker

// repo.go — raw pgx queries for the bot-worker.
//
// Prisma → SQL table/column mapping (verified against prisma/schema.prisma):
//
//	Prisma model   Prisma @@map        SQL table         Notes
//	User           @@map("user")       "user"            camelCase cols preserved
//	RMHark         @@map("rmheet")     "rmheet"          camelCase cols preserved
//	RMHarkComment  @@map("rmheet_comment") "rmheet_comment" camelCase cols preserved
//	UserProfile    @@map("user_profile")  "user_profile"  camelCase cols preserved
//	Follow         @@map("follow")     "follow"
//	Conversation   @@map("conversation") "conversation"  camelCase cols preserved
//	DirectMessage  @@map("direct_message") "direct_message" camelCase cols preserved
//
// Column names are stored by Prisma as-is (camelCase) because no field-level
// @map directives are used on any of the relevant fields.
//
// Relevant columns by table:
//   "user":            id, name, handle, image, "isBot", "botPersona", "botLastPostAt"
//   "user_profile":    id, "userId", bio, "dmPrivacy"
//   "rmheet":          id, "userId", content, "imageUrls", "commentCount", "deletedAt", "createdAt", "originalId"
//   "rmheet_comment":  id, "rmheetId", "userId", content, "parentId", "deletedAt", "createdAt"
//   "follow":          id, "followerId", "followingId"
//   "conversation":    id, "participantOneId", "participantTwoId", "lastMessageAt"
//   "direct_message":  id, "conversationId", "senderId", content, read, "createdAt"

import (
	"context"
	crand "crypto/rand"
	"encoding/binary"
	"fmt"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/db"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// Repo is the data-access interface for the bot-worker. All methods accept a
// context and return typed results or errors.
type Repo interface {
	// CountBots returns how many "isBot = true" users exist.
	CountBots(ctx context.Context) (int, error)
	// HandleExists reports whether a given handle is taken.
	HandleExists(ctx context.Context, handle string) (bool, error)
	// CreateBotUser inserts a new bot user + profile row.
	CreateBotUser(ctx context.Context, name, handle, image, persona, bio string) error
	// LoadBots returns all bot users with pacing fields.
	LoadBots(ctx context.Context) ([]BotUser, error)
	// InsertPost creates a new rmheet and returns its id.
	InsertPost(ctx context.Context, userID, content string, imageURLs []string) (string, error)
	// UpdateBotLastPostAt sets botLastPostAt = now for the given user id.
	UpdateBotLastPostAt(ctx context.Context, userID string) error

	// ─── Reply tick ──────────────────────────────────────────────────
	RecentComments(ctx context.Context, since time.Time) ([]CommentRow, error)
	CommentAlreadyAnswered(ctx context.Context, commentID, targetBotID string) (bool, error)
	BuildReplyContext(ctx context.Context, commentID string) (*ReplyContext, error)
	InsertComment(ctx context.Context, rmheetID, userID, content string, parentID *string) error
	RecentBotPosts(ctx context.Context, since time.Time) ([]BotPostRow, error)
	BotsExcept(ctx context.Context, excludeID string) ([]BotUser, error)
	CommentersOnPost(ctx context.Context, rmheetID string) (map[string]bool, error)

	// ─── DM tick ─────────────────────────────────────────────────────
	RecentBotConversations(ctx context.Context, since time.Time) ([]ConversationRow, error)
	LastMessageSender(ctx context.Context, conversationID string) (string, error)
	RecentDMHistory(ctx context.Context, conversationID string) ([]dmMessage, error)
	SendBotDM(ctx context.Context, conversationID, botID, content string) (messagePayload, error)
	DMPrivacy(ctx context.Context, userID string) (DmPrivacy, error)
	FollowExists(ctx context.Context, followerID, followingID string) (bool, error)
	ConversationOpenerMessages(ctx context.Context, pOne, pTwo string) (string, []policyMessage, error)
	UpsertConversation(ctx context.Context, pOne, pTwo string) (string, error)
	RecentActiveHumans(ctx context.Context, since time.Time) ([]string, error)

	// ─── Image budget ────────────────────────────────────────────────
	ReserveImageBudget(ctx context.Context, day string, capLimit int) (bool, error)
}

// PGRepo is the production Repo backed by the shared pgx pool.
type PGRepo struct {
	db      *db.DB
	metrics *telemetry.Metrics
}

// NewPGRepo wraps a *db.DB as a Repo.
func NewPGRepo(database *db.DB, metrics *telemetry.Metrics) *PGRepo {
	return &PGRepo{db: database, metrics: metrics}
}

func (r *PGRepo) record(err error) {
	if r.metrics == nil {
		return
	}
	if err != nil {
		r.metrics.DBQueries.WithLabelValues("error").Inc()
	} else {
		r.metrics.DBQueries.WithLabelValues("ok").Inc()
	}
}

// CountBots returns the number of bot users.
// Ports: prisma.user.count({ where: { isBot: true } })
func (r *PGRepo) CountBots(ctx context.Context) (n int, err error) {
	defer func() { r.record(err) }()
	const q = `SELECT COUNT(*) FROM "user" WHERE "isBot" = true`
	if err = r.db.Pool.QueryRow(ctx, q).Scan(&n); err != nil {
		return 0, fmt.Errorf("botworker: count bots: %w", err)
	}
	return n, nil
}

// HandleExists reports whether a given handle is already taken.
// Ports: prisma.user.findUnique({ where: { handle: candidate }, select: { id: true } })
func (r *PGRepo) HandleExists(ctx context.Context, handle string) (exists bool, err error) {
	defer func() { r.record(err) }()
	const q = `SELECT EXISTS(SELECT 1 FROM "user" WHERE "handle" = $1)`
	if err = r.db.Pool.QueryRow(ctx, q, handle).Scan(&exists); err != nil {
		return false, fmt.Errorf("botworker: handle exists: %w", err)
	}
	return exists, nil
}

// CreateBotUser inserts a bot user and its profile in a transaction.
// Ports: prisma.user.create({ data: { name, handle, image, isBot: true, botPersona, profile: { create: { bio } } } })
func (r *PGRepo) CreateBotUser(ctx context.Context, name, handle, image, persona, bio string) (err error) {
	defer func() { r.record(err) }()

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("botworker: create bot user: begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	// Insert user row. The schema uses @default(cuid()) which is a Prisma JS
	// function, not a Postgres function, so we generate a compatible CUID in Go.
	id := newCUID()
	const qUser = `INSERT INTO "user" (id, name, handle, image, "isBot", "botPersona", "createdAt", "updatedAt")
	               VALUES ($1, $2, $3, $4, true, $5, now(), now())`
	if _, err = tx.Exec(ctx, qUser, id, name, handle, image, persona); err != nil {
		return fmt.Errorf("botworker: create bot user: insert user: %w", err)
	}

	profileID := newCUID()
	const qProfile = `INSERT INTO "user_profile" (id, "userId", bio, "createdAt", "updatedAt")
	                  VALUES ($1, $2, $3, now(), now())`
	if _, err = tx.Exec(ctx, qProfile, profileID, id, bio); err != nil {
		return fmt.Errorf("botworker: create bot user: insert profile: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("botworker: create bot user: commit: %w", err)
	}
	return nil
}

// LoadBots returns all bot users with the fields needed for pacing.
// Ports: prisma.user.findMany({ where: { isBot: true }, select: { id, botPersona, botLastPostAt } })
func (r *PGRepo) LoadBots(ctx context.Context) (bots []BotUser, err error) {
	defer func() { r.record(err) }()

	const q = `SELECT id, COALESCE("botPersona", ''), "botLastPostAt"
	             FROM "user"
	            WHERE "isBot" = true`
	rows, err := r.db.Pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("botworker: load bots: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var b BotUser
		if err = rows.Scan(&b.ID, &b.BotPersona, &b.BotLastPostAt); err != nil {
			return nil, fmt.Errorf("botworker: load bots scan: %w", err)
		}
		bots = append(bots, b)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("botworker: load bots iter: %w", err)
	}
	return bots, nil
}

// InsertPost creates a new rmheet (feed post) and returns its generated id.
// Ports: prisma.rMHark.create({ data: { userId, content, imageUrls } })
// SQL table: "rmheet" (RMHark @@map("rmheet"))
func (r *PGRepo) InsertPost(ctx context.Context, userID, content string, imageURLs []string) (id string, err error) {
	defer func() { r.record(err) }()

	if imageURLs == nil {
		imageURLs = []string{}
	}

	newID := newCUID()
	const q = `INSERT INTO "rmheet" (id, "userId", content, "imageUrls", "createdAt", "updatedAt")
	           VALUES ($1, $2, $3, $4, now(), now())`
	if _, err = r.db.Pool.Exec(ctx, q, newID, userID, content, imageURLs); err != nil {
		return "", fmt.Errorf("botworker: insert post: %w", err)
	}
	return newID, nil
}

// UpdateBotLastPostAt sets botLastPostAt = now() for the given user.
// Ports: prisma.user.update({ where: { id }, data: { botLastPostAt: new Date() } })
func (r *PGRepo) UpdateBotLastPostAt(ctx context.Context, userID string) (err error) {
	defer func() { r.record(err) }()

	const q = `UPDATE "user" SET "botLastPostAt" = now() WHERE id = $1`
	if _, err = r.db.Pool.Exec(ctx, q, userID); err != nil {
		return fmt.Errorf("botworker: update botLastPostAt: %w", err)
	}
	return nil
}

// newCUID generates a compact, collision-resistant id compatible with Prisma's
// cuid() format. We use a time-based hex string prefixed with 'c' to match the
// pattern (length ~25 chars). This is used when bypassing Prisma's cuid generator.
func newCUID() string {
	// Use nanosecond time + a crypto-random suffix for uniqueness, so two calls
	// in the same nanosecond do not collide on a primary-key ID.
	// Format: c + timestamp_hex + random_suffix_hex = ~25 chars.
	now := time.Now().UnixNano()
	return fmt.Sprintf("c%016x%08x", now, randSuffix())
}

// randSuffix returns a 32-bit value from crypto/rand. On the unlikely read
// error it falls back to a time-derived value so it never panics.
func randSuffix() uint32 {
	var b [4]byte
	if _, err := crand.Read(b[:]); err != nil {
		t := time.Now().UnixNano()
		return uint32(t>>32) ^ uint32(t)
	}
	return binary.BigEndian.Uint32(b[:])
}

