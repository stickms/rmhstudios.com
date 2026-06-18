// Package auth validates Better Auth sessions directly against Postgres.
//
// This is the single most important "we don't need the JS library" insight of
// the whole migration: the Node services already authenticate without the
// Better Auth SDK by running one SQL lookup (see server/rmhbox/auth.ts and
// server/socket-server/index.ts). Go reproduces that lookup exactly. Session
// *issuance*, OAuth callbacks and cookie signing remain owned by Better Auth
// in the React tier; the Go fleet only *trusts and validates* the shared
// "session" table.
package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Identity is the authenticated principal resolved from a session token.
type Identity struct {
	UserID  string
	Name    string
	Image   string
	IsAdmin bool
}

// ErrUnauthenticated is returned when a token is missing, unknown or expired.
var ErrUnauthenticated = errors.New("auth: unauthenticated")

// Validator resolves session tokens to identities using the shared pool.
type Validator struct {
	pool *pgxpool.Pool
}

// NewValidator builds a Validator over an existing pgx pool.
func NewValidator(pool *pgxpool.Pool) *Validator { return &Validator{pool: pool} }

// ValidateSession resolves a Better Auth session token. It returns
// ErrUnauthenticated for unknown or expired tokens. This is the verbatim port
// of the Node query:
//
//	SELECT s."userId", s."expiresAt", u."name", u."image", u."isAdmin"
//	FROM "session" s JOIN "user" u ON u."id" = s."userId"
//	WHERE s."token" = $1 LIMIT 1
func (v *Validator) ValidateSession(ctx context.Context, token string) (Identity, error) {
	if token == "" {
		return Identity{}, ErrUnauthenticated
	}
	const q = `SELECT s."userId", s."expiresAt", u."name", u."image", u."isAdmin"
		FROM "session" s JOIN "user" u ON u."id" = s."userId"
		WHERE s."token" = $1 LIMIT 1`

	var (
		userID    string
		expiresAt time.Time
		name      *string
		image     *string
		isAdmin   bool
	)
	err := v.pool.QueryRow(ctx, q, token).Scan(&userID, &expiresAt, &name, &image, &isAdmin)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, ErrUnauthenticated
		}
		return Identity{}, err
	}
	if time.Now().After(expiresAt) {
		return Identity{}, ErrUnauthenticated
	}
	id := Identity{UserID: userID, IsAdmin: isAdmin}
	if name != nil {
		id.Name = *name
	}
	if image != nil {
		id.Image = *image
	}
	return id, nil
}

// ResolveDiscordAccount maps a Discord user id (already verified upstream via
// Discord's /users/@me) to a platform user via the "account" table, mirroring
// the Discord-Activity auth path in the Node services.
func (v *Validator) ResolveDiscordAccount(ctx context.Context, discordUserID string) (Identity, error) {
	const q = `SELECT u."id", u."name", u."image", u."isAdmin"
		FROM "account" a JOIN "user" u ON u."id" = a."userId"
		WHERE a."providerId" = 'discord' AND a."accountId" = $1 LIMIT 1`
	var (
		userID  string
		name    *string
		image   *string
		isAdmin bool
	)
	err := v.pool.QueryRow(ctx, q, discordUserID).Scan(&userID, &name, &image, &isAdmin)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Identity{}, ErrUnauthenticated
		}
		return Identity{}, err
	}
	id := Identity{UserID: userID, IsAdmin: isAdmin}
	if name != nil {
		id.Name = *name
	}
	if image != nil {
		id.Image = *image
	}
	return id, nil
}
