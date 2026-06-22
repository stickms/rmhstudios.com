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
