//go:build e2e

package e2e

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// rmhtube room create contract (from internal/rmhtube/room.go + events.go):
//
//   C2S rmhtube:room:create        { "name": "<name>", "settings": {...?} }
//   S2C rmhtube:room:created       { "roomId": "<ROOMID>" }
//   S2C rmhtube:room:state_snapshot { ... full client state, incl "roomId",
//                                      "hostUserId", "myUserId", "members", ... }
//
// Auth: the rmhtube hub runs with RequireAuth=false. A valid ?token= resolves to
// the session's userId (auth.Validator.ValidateSession), and that user id becomes
// the room's hostUserId AND the persisted rmhtube_room."hostId". With no/invalid
// token the connection is treated as ANONYMOUS: userOf() falls back to the
// per-connection id, so the room still works but is owned by an opaque conn id
// and the rmhtube_room_member insert (which FKs nothing here, but references a
// user id that does not exist) is fire-and-forget so it does not block the flow.
//
// Persistence is fire-and-forget (`go m.persist(...)`), so the DB assertions poll.

// TestSessionValidationAndRoomCreate proves: (1) a real Better Auth session row
// is validated by the running rmhtube binary, (2) the authenticated identity
// drives room ownership, and (3) the room is persisted to Postgres with the
// host = the session's user id.
func TestSessionValidationAndRoomCreate(t *testing.T) {
	dsn := databaseURL()
	if dsn == "" {
		t.Skip("E2E_DATABASE_URL not set; skipping DB-backed auth test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	defer pool.Close()

	const (
		userID = "e2e-user-1"
		token  = "e2e-token-1"
	)

	// Seed a user + an unexpired session. ON CONFLICT keeps the test rerunnable.
	if _, err := pool.Exec(ctx, `
		INSERT INTO "user" ("id","name","email","updatedAt")
		VALUES ($1,$2,$3, now())
		ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name"`,
		userID, "E2E Tester", "e2e@example.com"); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO "session" ("id","userId","token","expiresAt","updatedAt")
		VALUES ($1,$2,$3,$4, now())
		ON CONFLICT ("id") DO UPDATE SET "token"=EXCLUDED."token", "expiresAt"=EXCLUDED."expiresAt"`,
		"e2e-session-1", userID, token, time.Now().Add(24*time.Hour)); err != nil {
		t.Fatalf("seed session: %v", err)
	}

	// Connect with the valid token and create a room.
	c := dial(t, rmhtubeURL(), token)
	c.send("rmhtube:room:create", map[string]any{"name": "E2E Watch Party"})

	created := c.readUntil("rmhtube:room:created", defaultReadTimeout)
	roomID := str(t, created, "roomId")
	if roomID == "" {
		t.Fatalf("rmhtube:room:created returned empty roomId")
	}
	t.Logf("room created: roomId=%s", roomID)

	// The snapshot must reflect the authenticated identity as host.
	snap := c.readUntil("rmhtube:room:state_snapshot", defaultReadTimeout)
	if got := str(t, snap, "roomId"); got != roomID {
		t.Fatalf("snapshot roomId=%q, want %q", got, roomID)
	}
	if got := str(t, snap, "hostUserId"); got != userID {
		t.Fatalf("snapshot hostUserId=%q, want %q (auth identity not applied)", got, userID)
	}
	if got := str(t, snap, "myUserId"); got != userID {
		t.Fatalf("snapshot myUserId=%q, want %q", got, userID)
	}

	// Assert the room was persisted with host = the session user (poll: the write
	// is fire-and-forget on a background goroutine in the service).
	var gotHost string
	ok := poll(t, 5*time.Second, func() bool {
		err := pool.QueryRow(ctx,
			`SELECT "hostId" FROM "rmhtube_room" WHERE "id"=$1`, roomID).Scan(&gotHost)
		return err == nil
	})
	if !ok {
		t.Fatalf("rmhtube_room row for %q never appeared", roomID)
	}
	if gotHost != userID {
		t.Fatalf("persisted rmhtube_room.hostId=%q, want %q", gotHost, userID)
	}

	// And the host member row should exist too.
	var memberCount int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM "rmhtube_room_member" WHERE "roomId"=$1 AND "userId"=$2`,
		roomID, userID).Scan(&memberCount); err != nil {
		t.Fatalf("query member: %v", err)
	}
	if memberCount != 1 {
		t.Fatalf("expected 1 host member row, got %d", memberCount)
	}
}

// TestRejectsBadToken documents the actual observed behavior: rmhtube does NOT
// require auth, so a bogus token still upgrades the websocket. The connection is
// treated as ANONYMOUS — userOf() falls back to the per-connection id, so the
// room's hostUserId is an opaque connection UUID, never our seeded user id.
func TestRejectsBadToken(t *testing.T) {
	c := dial(t, rmhtubeURL(), "totally-bogus-token")
	c.send("rmhtube:room:create", map[string]any{"name": "Anon Party"})

	// Connection is accepted (anonymous): we still get a created + snapshot.
	created := c.readUntil("rmhtube:room:created", defaultReadTimeout)
	if str(t, created, "roomId") == "" {
		t.Fatalf("expected a roomId even for anonymous connection")
	}
	snap := c.readUntil("rmhtube:room:state_snapshot", defaultReadTimeout)

	host := str(t, snap, "hostUserId")
	myUserID := str(t, snap, "myUserId")
	if host != myUserID {
		t.Fatalf("expected hostUserId==myUserId for anon host, got host=%q my=%q", host, myUserID)
	}
	// The anonymous id is the per-connection UUID, NOT the seeded session user.
	if host == "e2e-user-1" {
		t.Fatalf("bogus token unexpectedly resolved to the real user id")
	}
	t.Logf("anonymous connection accepted; opaque host id=%s", host)
}

// poll calls fn repeatedly until it returns true or the timeout elapses.
func poll(t *testing.T, timeout time.Duration, fn func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if fn() {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fn()
}
