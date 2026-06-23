package botworker

import (
	"strings"
	"testing"
)

// These tests pin the SQL strings to the exact Prisma-mapped tables/columns so
// the DB-integration-only queries are still guarded against accidental rename.

func TestRecentCommentsQueryTargetsCommentTable(t *testing.T) {
	q := recentCommentsQuery
	if !strings.Contains(q, `"rmheet_comment"`) {
		t.Errorf("recentCommentsQuery does not target rmheet_comment: %q", q)
	}
	for _, col := range []string{`"createdAt"`, `"deletedAt"`, `"rmheetId"`, `"parentId"`} {
		if !strings.Contains(q, col) {
			t.Errorf("recentCommentsQuery missing column %s", col)
		}
	}
}

func TestInsertCommentQueryTargetsCommentTable(t *testing.T) {
	q := insertCommentQuery
	if !strings.Contains(q, `INSERT INTO "rmheet_comment"`) {
		t.Errorf("insertCommentQuery wrong table: %q", q)
	}
	for _, col := range []string{`"rmheetId"`, `"userId"`, `content`, `"parentId"`} {
		if !strings.Contains(q, col) {
			t.Errorf("insertCommentQuery missing column %s", col)
		}
	}
}

func TestIncrementCommentCountQueryTargetsRmheet(t *testing.T) {
	q := incrementCommentCountQuery
	if !strings.Contains(q, `UPDATE "rmheet"`) || !strings.Contains(q, `"commentCount"`) {
		t.Errorf("incrementCommentCountQuery wrong: %q", q)
	}
}

func TestInsertDirectMessageQuery(t *testing.T) {
	q := insertDirectMessageQuery
	if !strings.Contains(q, `INSERT INTO "direct_message"`) {
		t.Errorf("insertDirectMessageQuery wrong table: %q", q)
	}
	for _, col := range []string{`"conversationId"`, `"senderId"`, `content`} {
		if !strings.Contains(q, col) {
			t.Errorf("insertDirectMessageQuery missing column %s", col)
		}
	}
}

func TestBumpConversationQuery(t *testing.T) {
	q := bumpConversationQuery
	if !strings.Contains(q, `UPDATE "conversation"`) || !strings.Contains(q, `"lastMessageAt"`) {
		t.Errorf("bumpConversationQuery wrong: %q", q)
	}
}

func TestRecentBotConversationsQuery(t *testing.T) {
	q := recentBotConversationsQuery
	if !strings.Contains(q, `"conversation"`) {
		t.Errorf("recentBotConversationsQuery wrong table: %q", q)
	}
	for _, col := range []string{`"participantOneId"`, `"participantTwoId"`, `"lastMessageAt"`} {
		if !strings.Contains(q, col) {
			t.Errorf("recentBotConversationsQuery missing column %s", col)
		}
	}
}

func TestUpsertImageBudgetQuery(t *testing.T) {
	q := reserveImageBudgetQuery
	if !strings.Contains(q, `"image_gen_budget"`) {
		t.Errorf("reserveImageBudgetQuery wrong table: %q", q)
	}
	if !strings.Contains(q, `count`) {
		t.Errorf("reserveImageBudgetQuery missing count column: %q", q)
	}
}

// TestReserveImageBudgetQueryDayRollover asserts the new upsert form handles the
// day-zero / first-call-of-the-day path correctly. The old CTE had a bug where
// the UPDATE ran against the pre-statement snapshot, so the INSERT via the CTE
// set count=0 and the UPDATE tried to increment it — but the WHERE count<cap
// applied to the snapshot row (no row yet), causing the first reservation each
// day to be silently dropped.
//
// The new query uses a single INSERT … ON CONFLICT … DO UPDATE with RETURNING,
// so on day-zero the INSERT branch fires directly (count starts at 1) and
// RETURNING count yields the row — guaranteeing the first call succeeds.
func TestReserveImageBudgetQueryDayRolloverForm(t *testing.T) {
	q := reserveImageBudgetQuery

	// Must be an INSERT (upsert), not a CTE-style WITH … UPDATE.
	if !strings.Contains(q, `INSERT INTO "image_gen_budget"`) {
		t.Errorf("reserveImageBudgetQuery must use INSERT upsert, not CTE: %q", q)
	}
	if strings.Contains(q, `WITH `) {
		t.Errorf("reserveImageBudgetQuery must not use a CTE (WITH clause): %q", q)
	}

	// Must have ON CONFLICT so day-zero rows are inserted atomically.
	if !strings.Contains(q, `ON CONFLICT`) {
		t.Errorf("reserveImageBudgetQuery missing ON CONFLICT clause: %q", q)
	}

	// Must use RETURNING so the caller can detect cap-reached via ErrNoRows.
	if !strings.Contains(q, `RETURNING`) {
		t.Errorf("reserveImageBudgetQuery missing RETURNING clause: %q", q)
	}

	// The initial insert value must be 1, not 0, so the first reservation is
	// immediately counted (count starts at 1 on INSERT, not 0).
	if !strings.Contains(q, `VALUES ($1, 1)`) {
		t.Errorf("reserveImageBudgetQuery INSERT must use count=1, not count=0: %q", q)
	}
}
