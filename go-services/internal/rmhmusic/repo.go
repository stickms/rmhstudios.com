package rmhmusic

import (
	"context"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/db"
)

// Repo persists the durable part of a room. NOTE (faithful to the Node service):
// the original code only persists the room ROW on create — members, queue,
// playback and chat live entirely in memory and are intentionally NOT written to
// the database. We replicate that exactly: the only write is CreateRoom, and it
// is fire-and-forget (a failure is logged, never surfaced to the client).
type Repo interface {
	CreateRoom(ctx context.Context, r RoomRow) error
}

// RoomRow is the persisted "rmh_music_room" row.
//
// DDL:
//
//	"id" TEXT PK, "code" TEXT, "name" VARCHAR(64), "hostId" TEXT,
//	"isPublic" BOOLEAN default true, "password" TEXT null,
//	"maxMembers" INTEGER default 10, "createdAt", "updatedAt"
type RoomRow struct {
	ID         string
	Code       string
	Name       string
	HostID     string
	IsPublic   bool
	Password   *string // null when the room has no password
	MaxMembers int
}

// PgRepo is the pgx-backed Repo.
type PgRepo struct{ db *db.DB }

// NewPgRepo builds a Repo over the shared pool.
func NewPgRepo(database *db.DB) *PgRepo { return &PgRepo{db: database} }

// CreateRoom inserts the room row. Quoted, camelCase column names match the
// Prisma/better-auth schema convention used across the codebase.
func (p *PgRepo) CreateRoom(ctx context.Context, r RoomRow) error {
	now := time.Now()
	_, err := p.db.Pool.Exec(ctx, `
		INSERT INTO "rmh_music_room"
			("id","code","name","hostId","isPublic","password","maxMembers","createdAt","updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
		r.ID, r.Code, r.Name, r.HostID, r.IsPublic, r.Password, r.MaxMembers, now,
	)
	return err
}

// NopRepo is a Repo that persists nothing — used when the service boots without
// a database (the room logic is fully in-memory and works regardless).
type NopRepo struct{}

func (NopRepo) CreateRoom(context.Context, RoomRow) error { return nil }
