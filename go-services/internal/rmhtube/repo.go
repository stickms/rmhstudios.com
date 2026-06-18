package rmhtube

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repo is the persistence seam for the room logic. The room/sync/queue/chat
// managers depend only on this interface, so they are exercisable in unit tests
// with a no-op or fake implementation (the gamehub port keeps its core logic
// DB-free for the same reason; rmhtube persists, so we abstract instead).
//
// All methods take a context and return an error; the managers call them
// fire-and-forget (logging failures) exactly as the TS server did, so a slow or
// failing DB never blocks a real-time mutation.
type Repo interface {
	// RestoreActiveRooms loads every not-closed room (with its live members,
	// unplayed queue and recent chat) for startup hydration.
	RestoreActiveRooms(ctx context.Context) ([]restoredRoom, error)
	// LoadRoom loads a single not-closed room on demand (join miss). Returns
	// (nil, nil) when the room does not exist or is closed.
	LoadRoom(ctx context.Context, roomID string) (*restoredRoom, error)

	CreateRoom(ctx context.Context, r *room) error
	CloseRoom(ctx context.Context, roomID string) error
	UpdateHost(ctx context.Context, roomID, hostID string) error
	UpdateSettings(ctx context.Context, roomID string, s roomSettings) error

	MemberJoin(ctx context.Context, roomID, userID string) error
	MemberLeave(ctx context.Context, roomID, userID string) error

	QueueAdd(ctx context.Context, roomID string, it *queueItem) error
	QueueRemove(ctx context.Context, itemID string) error
	QueuePlayed(ctx context.Context, itemID string) error
	QueuePositions(ctx context.Context, items []*queueItem) error
}

// restoredRoom is the DB-shaped projection used to rebuild an in-memory room.
type restoredRoom struct {
	ID         string
	Name       string
	HostID     string
	IsPublic   bool
	Password   string
	MaxMembers int
	AllowQueue bool
	AllowSkip  bool
	AutoPlay   bool
	CreatedAt  int64
	UpdatedAt  int64
	Members    []restoredMember
	Queue      []*queueItem
	Chat       []*chatMessage
}

type restoredMember struct {
	UserID   string
	UserName string
	Avatar   string
	JoinedAt int64
}

// ─── No-op repo (used when DATABASE_URL is unset and in tests) ──────────────

// NopRepo satisfies Repo without persisting anything. RestoreActiveRooms and
// LoadRoom return nothing, so the service runs purely in-memory.
type NopRepo struct{}

func (NopRepo) RestoreActiveRooms(context.Context) ([]restoredRoom, error) { return nil, nil }
func (NopRepo) LoadRoom(context.Context, string) (*restoredRoom, error)    { return nil, nil }
func (NopRepo) CreateRoom(context.Context, *room) error                    { return nil }
func (NopRepo) CloseRoom(context.Context, string) error                    { return nil }
func (NopRepo) UpdateHost(context.Context, string, string) error           { return nil }
func (NopRepo) UpdateSettings(context.Context, string, roomSettings) error { return nil }
func (NopRepo) MemberJoin(context.Context, string, string) error           { return nil }
func (NopRepo) MemberLeave(context.Context, string, string) error          { return nil }
func (NopRepo) QueueAdd(context.Context, string, *queueItem) error         { return nil }
func (NopRepo) QueueRemove(context.Context, string) error                  { return nil }
func (NopRepo) QueuePlayed(context.Context, string) error                  { return nil }
func (NopRepo) QueuePositions(context.Context, []*queueItem) error         { return nil }

// ─── pgx-backed repo ────────────────────────────────────────────────────────

// PgxRepo is the production Repo: raw pgx against the quoted-identifier schema
// (Prisma-managed tables). Column/table names are kept verbatim with the TS DDL.
type PgxRepo struct {
	pool *pgxpool.Pool
}

// NewPgxRepo wraps a pgx pool.
func NewPgxRepo(pool *pgxpool.Pool) *PgxRepo { return &PgxRepo{pool: pool} }

func (p *PgxRepo) RestoreActiveRooms(ctx context.Context) ([]restoredRoom, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT "id","name","hostId","isPublic","password","maxMembers",
		       "allowMemberQueue","allowMemberSkip","autoPlay","createdAt","updatedAt"
		FROM "rmhtube_room"
		WHERE "closedAt" IS NULL`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []restoredRoom
	for rows.Next() {
		r, err := scanRoom(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Hydrate members + queue + chat per room. Skip rooms with no live members,
	// mirroring restoreRoomsFromDb.
	final := out[:0]
	for i := range out {
		if err := p.hydrate(ctx, &out[i]); err != nil {
			return nil, err
		}
		if len(out[i].Members) == 0 {
			continue
		}
		final = append(final, out[i])
	}
	return final, nil
}

func (p *PgxRepo) LoadRoom(ctx context.Context, roomID string) (*restoredRoom, error) {
	row := p.pool.QueryRow(ctx, `
		SELECT "id","name","hostId","isPublic","password","maxMembers",
		       "allowMemberQueue","allowMemberSkip","autoPlay","createdAt","updatedAt"
		FROM "rmhtube_room"
		WHERE "id"=$1 AND "closedAt" IS NULL`, roomID)
	r, err := scanRoom(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := p.hydrate(ctx, &r); err != nil {
		return nil, err
	}
	return &r, nil
}

// rowScanner unifies pgx.Row and pgx.Rows for scanRoom.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanRoom(s rowScanner) (restoredRoom, error) {
	var (
		r          restoredRoom
		name       *string
		password   *string
		maxMembers int32
		created    time.Time
		updated    time.Time
	)
	err := s.Scan(&r.ID, &name, &r.HostID, &r.IsPublic, &password, &maxMembers,
		&r.AllowQueue, &r.AllowSkip, &r.AutoPlay, &created, &updated)
	if err != nil {
		return restoredRoom{}, err
	}
	if name != nil {
		r.Name = *name
	}
	if password != nil {
		r.Password = *password
	}
	r.MaxMembers = int(maxMembers)
	r.CreatedAt = created.UnixMilli()
	r.UpdatedAt = updated.UnixMilli()
	return r, nil
}

func (p *PgxRepo) hydrate(ctx context.Context, r *restoredRoom) error {
	// Live members joined to "user" for name/image.
	mrows, err := p.pool.Query(ctx, `
		SELECT m."userId", u."name", u."image", m."joinedAt"
		FROM "rmhtube_room_member" m
		JOIN "user" u ON u."id" = m."userId"
		WHERE m."roomId"=$1 AND m."leftAt" IS NULL`, r.ID)
	if err != nil {
		return err
	}
	for mrows.Next() {
		var (
			rm    restoredMember
			name  *string
			image *string
			jt    time.Time
		)
		if err := mrows.Scan(&rm.UserID, &name, &image, &jt); err != nil {
			mrows.Close()
			return err
		}
		rm.UserName = derefOr(name, "Unknown")
		rm.Avatar = derefOr(image, "")
		rm.JoinedAt = jt.UnixMilli()
		r.Members = append(r.Members, rm)
	}
	mrows.Close()
	if err := mrows.Err(); err != nil {
		return err
	}

	// Unplayed queue, ordered by position.
	qrows, err := p.pool.Query(ctx, `
		SELECT "id","url","mediaType","title","duration","thumbnailUrl",
		       "addedById","addedByName","position","createdAt"
		FROM "rmhtube_queue_item"
		WHERE "roomId"=$1 AND "playedAt" IS NULL
		ORDER BY "position" ASC`, r.ID)
	if err != nil {
		return err
	}
	for qrows.Next() {
		var (
			it    queueItem
			dur   *int32
			thumb *string
			ct    time.Time
		)
		if err := qrows.Scan(&it.ID, &it.URL, &it.MediaType, &it.Title, &dur, &thumb,
			&it.AddedBy, &it.AddedByName, &it.Position, &ct); err != nil {
			qrows.Close()
			return err
		}
		if dur != nil {
			d := int(*dur)
			it.Duration = &d
		}
		it.Thumbnail = derefOr(thumb, "")
		it.AddedAt = ct.UnixMilli()
		item := it
		r.Queue = append(r.Queue, &item)
	}
	qrows.Close()
	return qrows.Err()
}

func (p *PgxRepo) CreateRoom(ctx context.Context, r *room) error {
	// Room row + host member in one transaction (mirrors the nested Prisma create).
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO "rmhtube_room"
		  ("id","name","hostId","isPublic","password","maxMembers",
		   "allowMemberQueue","allowMemberSkip","autoPlay","createdAt","updatedAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), now())`,
		r.ID, nullStr(r.Name), r.HostUserID, r.Settings.IsPublic, nullStr(r.Settings.Password),
		int32(r.Settings.MaxMembers), r.Settings.AllowMemberQueue, r.Settings.AllowMemberSkip, r.Settings.AutoPlay)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO "rmhtube_room_member" ("id","roomId","userId","joinedAt")
		VALUES ($1,$2,$3, now())`, nanoid(24), r.ID, r.HostUserID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (p *PgxRepo) CloseRoom(ctx context.Context, roomID string) error {
	_, err := p.pool.Exec(ctx, `UPDATE "rmhtube_room" SET "closedAt"=now(), "updatedAt"=now() WHERE "id"=$1`, roomID)
	return err
}

func (p *PgxRepo) UpdateHost(ctx context.Context, roomID, hostID string) error {
	_, err := p.pool.Exec(ctx, `UPDATE "rmhtube_room" SET "hostId"=$2, "updatedAt"=now() WHERE "id"=$1`, roomID, hostID)
	return err
}

func (p *PgxRepo) UpdateSettings(ctx context.Context, roomID string, s roomSettings) error {
	_, err := p.pool.Exec(ctx, `
		UPDATE "rmhtube_room"
		SET "isPublic"=$2,"password"=$3,"maxMembers"=$4,
		    "allowMemberQueue"=$5,"allowMemberSkip"=$6,"autoPlay"=$7,"updatedAt"=now()
		WHERE "id"=$1`,
		roomID, s.IsPublic, nullStr(s.Password), int32(s.MaxMembers),
		s.AllowMemberQueue, s.AllowMemberSkip, s.AutoPlay)
	return err
}

func (p *PgxRepo) MemberJoin(ctx context.Context, roomID, userID string) error {
	// Upsert on (roomId,userId): re-joining clears leftAt (mirrors the Prisma upsert).
	_, err := p.pool.Exec(ctx, `
		INSERT INTO "rmhtube_room_member" ("id","roomId","userId","joinedAt")
		VALUES ($1,$2,$3, now())
		ON CONFLICT ("roomId","userId") DO UPDATE SET "leftAt"=NULL`,
		nanoid(24), roomID, userID)
	return err
}

func (p *PgxRepo) MemberLeave(ctx context.Context, roomID, userID string) error {
	_, err := p.pool.Exec(ctx, `
		UPDATE "rmhtube_room_member" SET "leftAt"=now()
		WHERE "roomId"=$1 AND "userId"=$2 AND "leftAt" IS NULL`, roomID, userID)
	return err
}

func (p *PgxRepo) QueueAdd(ctx context.Context, roomID string, it *queueItem) error {
	_, err := p.pool.Exec(ctx, `
		INSERT INTO "rmhtube_queue_item"
		  ("id","roomId","url","mediaType","title","duration","thumbnailUrl",
		   "addedById","addedByName","position","createdAt")
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())`,
		it.ID, roomID, it.URL, it.MediaType, it.Title, nullInt(it.Duration),
		nullStr(it.Thumbnail), it.AddedBy, it.AddedByName, int32(it.Position))
	return err
}

func (p *PgxRepo) QueueRemove(ctx context.Context, itemID string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM "rmhtube_queue_item" WHERE "id"=$1`, itemID)
	return err
}

func (p *PgxRepo) QueuePlayed(ctx context.Context, itemID string) error {
	_, err := p.pool.Exec(ctx, `UPDATE "rmhtube_queue_item" SET "playedAt"=now() WHERE "id"=$1`, itemID)
	return err
}

func (p *PgxRepo) QueuePositions(ctx context.Context, items []*queueItem) error {
	if len(items) == 0 {
		return nil
	}
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, it := range items {
		if _, err := tx.Exec(ctx, `UPDATE "rmhtube_queue_item" SET "position"=$2 WHERE "id"=$1`, it.ID, int32(it.Position)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ─── small helpers ──────────────────────────────────────────────────────────

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(p *int) any {
	if p == nil {
		return nil
	}
	return int32(*p)
}

func derefOr(p *string, fallback string) string {
	if p == nil || *p == "" {
		return fallback
	}
	return *p
}
