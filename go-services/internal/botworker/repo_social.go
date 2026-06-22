package botworker

// repo_social.go — pgx queries for the reply tick, DM tick, and image budget.
//
// Additional Prisma → SQL mappings (verified against prisma/schema.prisma):
//
//	Prisma model     @@map                  SQL table          Columns used
//	RMHarkComment    @@map("rmheet_comment") "rmheet_comment"  id, "rmheetId", "userId", content, "parentId", "deletedAt", "createdAt"
//	RMHark           @@map("rmheet")        "rmheet"           id, "userId", content, "originalId", "deletedAt", "createdAt", "commentCount"
//	Conversation     @@map("conversation")  "conversation"     id, "participantOneId", "participantTwoId", "lastMessageAt"
//	DirectMessage    @@map("direct_message") "direct_message"  id, "conversationId", "senderId", content, read, "createdAt"
//	UserProfile      @@map("user_profile")  "user_profile"     "userId", "dmPrivacy"
//	Follow           @@map("follow")        "follow"           "followerId", "followingId"
//	ImageGenBudget   @@map("image_gen_budget") "image_gen_budget" day, count

import (
	"context"
	"fmt"
	"time"
)

// ─── Query strings (pinned by query_test.go) ──────────────────────────

const recentCommentsQuery = `
SELECT c.id, c."userId", c."parentId", c."rmheetId",
       cu."isBot"            AS author_is_bot,
       p."userId"            AS post_user_id,
       p."deletedAt"         AS post_deleted_at,
       pu."isBot"            AS post_user_is_bot,
       par."userId"          AS parent_user_id,
       paru."isBot"          AS parent_user_is_bot
  FROM "rmheet_comment" c
  JOIN "user" cu             ON cu.id = c."userId"
  JOIN "rmheet" p            ON p.id = c."rmheetId"
  JOIN "user" pu             ON pu.id = p."userId"
  LEFT JOIN "rmheet_comment" par ON par.id = c."parentId"
  LEFT JOIN "user" paru      ON paru.id = par."userId"
 WHERE c."createdAt" >= $1 AND c."deletedAt" IS NULL
 ORDER BY c."createdAt" DESC
 LIMIT 80`

// commentAlreadyAnsweredQuery checks whether the target bot already replied to a
// given comment (so we never double-answer). Ports the Node replies.some check.
const commentAlreadyAnsweredQuery = `
SELECT EXISTS(
  SELECT 1 FROM "rmheet_comment"
   WHERE "parentId" = $1 AND "userId" = $2 AND "deletedAt" IS NULL
)`

const insertCommentQuery = `
INSERT INTO "rmheet_comment" (id, "rmheetId", "userId", content, "parentId", "createdAt", "updatedAt")
VALUES ($1, $2, $3, $4, $5, now(), now())`

const incrementCommentCountQuery = `
UPDATE "rmheet" SET "commentCount" = "commentCount" + 1 WHERE id = $1`

// buildReplyContextQuery walks one comment node (content, parentId, rmheetId).
const replyNodeQuery = `
SELECT content, "parentId", "rmheetId" FROM "rmheet_comment" WHERE id = $1`

// postContentQuery fetches a post's content plus the content of any post it quotes.
const postContentQuery = `
SELECT p.content, o.content
  FROM "rmheet" p
  LEFT JOIN "rmheet" o ON o.id = p."originalId"
 WHERE p.id = $1`

// recentBotPostsQuery selects recent non-deleted posts authored by bots, for the
// proactive seedBotConversation path.
const recentBotPostsQuery = `
SELECT p.id, p.content, p."userId", o.content AS quoted
  FROM "rmheet" p
  JOIN "user" u ON u.id = p."userId"
  LEFT JOIN "rmheet" o ON o.id = p."originalId"
 WHERE p."deletedAt" IS NULL AND p."createdAt" >= $1 AND u."isBot" = true
 ORDER BY p."createdAt" DESC
 LIMIT 20`

// botsExceptQuery returns bot users other than a given author, with persona.
const botsExceptQuery = `
SELECT id, COALESCE("botPersona", '') FROM "user" WHERE "isBot" = true AND id <> $1`

// commentersOnPostQuery returns the user ids that already commented on a post.
const commentersOnPostQuery = `
SELECT DISTINCT "userId" FROM "rmheet_comment" WHERE "rmheetId" = $1`

// ─── DM queries ────────────────────────────────────────────────────────

const recentBotConversationsQuery = `
SELECT c.id, c."participantOneId", c."participantTwoId",
       p1."isBot" AS one_is_bot, p2."isBot" AS two_is_bot
  FROM "conversation" c
  JOIN "user" p1 ON p1.id = c."participantOneId"
  JOIN "user" p2 ON p2.id = c."participantTwoId"
 WHERE c."lastMessageAt" >= $1 AND (p1."isBot" = true OR p2."isBot" = true)
 ORDER BY c."lastMessageAt" DESC
 LIMIT 60`

// lastMessageSenderQuery returns the sender id of the latest message in a convo.
const lastMessageSenderQuery = `
SELECT "senderId" FROM "direct_message"
 WHERE "conversationId" = $1
 ORDER BY "createdAt" DESC LIMIT 1`

// recentDMHistoryQuery returns the last 20 messages of a conversation, newest first.
const recentDMHistoryQuery = `
SELECT "senderId", content FROM "direct_message"
 WHERE "conversationId" = $1
 ORDER BY "createdAt" DESC LIMIT 20`

const insertDirectMessageQuery = `
INSERT INTO "direct_message" (id, "conversationId", "senderId", content, read, "createdAt")
VALUES ($1, $2, $3, $4, false, now())
RETURNING id, read, "createdAt"`

const bumpConversationQuery = `
UPDATE "conversation" SET "lastMessageAt" = now() WHERE id = $1`

// dmPrivacyQuery reads a human's DM privacy setting from their profile.
const dmPrivacyQuery = `
SELECT COALESCE("dmPrivacy"::text, 'EVERYONE') FROM "user_profile" WHERE "userId" = $1`

// followExistsQuery checks whether followerId follows followingId.
const followExistsQuery = `
SELECT EXISTS(SELECT 1 FROM "follow" WHERE "followerId" = $1 AND "followingId" = $2)`

// findConversationQuery finds an existing conversation between two ordered participants.
const findConversationQuery = `
SELECT id FROM "conversation" WHERE "participantOneId" = $1 AND "participantTwoId" = $2`

// conversationOpenerMessagesQuery returns the first 10 messages of a conversation
// (oldest first), for the anti-pester initiation decision.
const conversationOpenerMessagesQuery = `
SELECT "senderId", "createdAt" FROM "direct_message"
 WHERE "conversationId" = $1
 ORDER BY "createdAt" ASC LIMIT 10`

const upsertConversationQuery = `
INSERT INTO "conversation" (id, "participantOneId", "participantTwoId", "lastMessageAt", "createdAt")
VALUES ($1, $2, $3, now(), now())
ON CONFLICT ("participantOneId", "participantTwoId") DO UPDATE SET "participantOneId" = EXCLUDED."participantOneId"
RETURNING id`

// recentActiveHumansQuery returns distinct non-bot user ids who posted or
// commented within the lookback window (union of two recent-activity selects).
const recentActiveHumansQuery = `
SELECT DISTINCT uid FROM (
  SELECT p."userId" AS uid
    FROM "rmheet" p JOIN "user" u ON u.id = p."userId"
   WHERE p."createdAt" >= $1 AND p."deletedAt" IS NULL AND u."isBot" = false
   ORDER BY p."createdAt" DESC LIMIT 200
  UNION
  SELECT c."userId" AS uid
    FROM "rmheet_comment" c JOIN "user" u ON u.id = c."userId"
   WHERE c."createdAt" >= $1 AND c."deletedAt" IS NULL AND u."isBot" = false
   ORDER BY c."createdAt" DESC LIMIT 200
) sub`

// ─── Image budget ──────────────────────────────────────────────────────

// reserveImageBudgetQuery atomically reserves one unit of today's budget. The
// CTE ensures the row exists, then conditionally increments only while under cap.
const reserveImageBudgetQuery = `
WITH ensure AS (
  INSERT INTO "image_gen_budget" (day, count) VALUES ($1, 0)
  ON CONFLICT (day) DO NOTHING
)
UPDATE "image_gen_budget" SET count = count + 1
 WHERE day = $1 AND count < $2`

// ─── Reply-tick row types ──────────────────────────────────────────────

// CommentRow is a recent comment with the bot-ness of the author and the
// reply target (parent comment author, or post author when top-level).
type CommentRow struct {
	ID             string
	UserID         string
	ParentID       *string
	RmheetID       string
	AuthorIsBot    bool
	PostUserID     string
	PostDeletedAt  *time.Time
	PostUserIsBot  bool
	ParentUserID   *string
	ParentUserIsBot *bool
}

// ReplyContext is the assembled context for replying to a comment.
type ReplyContext struct {
	PostContent       string
	QuotedPostContent string
	Thread            []string
}

// BotPostRow is a recent bot-authored post for proactive seeding.
type BotPostRow struct {
	ID            string
	Content       string
	UserID        string
	QuotedContent string
}

// ConversationRow is a recent conversation with one or both bot participants.
type ConversationRow struct {
	ID               string
	ParticipantOneID string
	ParticipantTwoID string
	OneIsBot         bool
	TwoIsBot         bool
}

// ─── Reply-tick repo methods ───────────────────────────────────────────

// RecentComments loads recent non-deleted comments with reply-target metadata.
func (r *PGRepo) RecentComments(ctx context.Context, since time.Time) (rows []CommentRow, err error) {
	defer func() { r.record(err) }()
	qrows, err := r.db.Pool.Query(ctx, recentCommentsQuery, since)
	if err != nil {
		return nil, fmt.Errorf("botworker: recent comments: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var c CommentRow
		if err = qrows.Scan(&c.ID, &c.UserID, &c.ParentID, &c.RmheetID,
			&c.AuthorIsBot, &c.PostUserID, &c.PostDeletedAt, &c.PostUserIsBot,
			&c.ParentUserID, &c.ParentUserIsBot); err != nil {
			return nil, fmt.Errorf("botworker: scan comment: %w", err)
		}
		rows = append(rows, c)
	}
	return rows, qrows.Err()
}

// CommentAlreadyAnswered reports whether targetBotID already replied to commentID.
func (r *PGRepo) CommentAlreadyAnswered(ctx context.Context, commentID, targetBotID string) (answered bool, err error) {
	defer func() { r.record(err) }()
	if err = r.db.Pool.QueryRow(ctx, commentAlreadyAnsweredQuery, commentID, targetBotID).Scan(&answered); err != nil {
		return false, fmt.Errorf("botworker: comment answered: %w", err)
	}
	return answered, nil
}

// BuildReplyContext walks the ancestor comment chain (top→bottom) and resolves
// the post + any quoted post. Mirrors Node buildReplyContext().
func (r *PGRepo) BuildReplyContext(ctx context.Context, commentID string) (ctxOut *ReplyContext, err error) {
	defer func() { r.record(err) }()
	var thread []string
	currentID := commentID
	var rmheetID string
	for depth := 0; currentID != "" && depth < maxReplyDepth+2; depth++ {
		var content string
		var parentID *string
		var rid string
		row := r.db.Pool.QueryRow(ctx, replyNodeQuery, currentID)
		if scanErr := row.Scan(&content, &parentID, &rid); scanErr != nil {
			break // no such node
		}
		thread = append([]string{content}, thread...)
		rmheetID = rid
		if parentID == nil {
			currentID = ""
		} else {
			currentID = *parentID
		}
	}
	if rmheetID == "" {
		return nil, nil
	}
	var postContent, quoted string
	if scanErr := r.db.Pool.QueryRow(ctx, postContentQuery, rmheetID).Scan(&postContent, &quoted); scanErr != nil {
		return nil, nil
	}
	return &ReplyContext{PostContent: postContent, QuotedPostContent: quoted, Thread: thread}, nil
}

// InsertComment inserts a bot reply and bumps the post's comment counter in one
// transaction. Mirrors the Node prisma.$transaction([create, update]).
func (r *PGRepo) InsertComment(ctx context.Context, rmheetID, userID, content string, parentID *string) (err error) {
	defer func() { r.record(err) }()
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("botworker: insert comment begin: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	if _, err = tx.Exec(ctx, insertCommentQuery, newCUID(), rmheetID, userID, content, parentID); err != nil {
		return fmt.Errorf("botworker: insert comment: %w", err)
	}
	if _, err = tx.Exec(ctx, incrementCommentCountQuery, rmheetID); err != nil {
		return fmt.Errorf("botworker: increment comment count: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("botworker: insert comment commit: %w", err)
	}
	return nil
}

// RecentBotPosts loads recent bot-authored posts for proactive seeding.
func (r *PGRepo) RecentBotPosts(ctx context.Context, since time.Time) (rows []BotPostRow, err error) {
	defer func() { r.record(err) }()
	qrows, err := r.db.Pool.Query(ctx, recentBotPostsQuery, since)
	if err != nil {
		return nil, fmt.Errorf("botworker: recent bot posts: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var p BotPostRow
		var quoted *string
		if err = qrows.Scan(&p.ID, &p.Content, &p.UserID, &quoted); err != nil {
			return nil, fmt.Errorf("botworker: scan bot post: %w", err)
		}
		if quoted != nil {
			p.QuotedContent = *quoted
		}
		rows = append(rows, p)
	}
	return rows, qrows.Err()
}

// BotsExcept returns bot users other than excludeID, with persona.
func (r *PGRepo) BotsExcept(ctx context.Context, excludeID string) (bots []BotUser, err error) {
	defer func() { r.record(err) }()
	qrows, err := r.db.Pool.Query(ctx, botsExceptQuery, excludeID)
	if err != nil {
		return nil, fmt.Errorf("botworker: bots except: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var b BotUser
		if err = qrows.Scan(&b.ID, &b.BotPersona); err != nil {
			return nil, fmt.Errorf("botworker: scan bot: %w", err)
		}
		bots = append(bots, b)
	}
	return bots, qrows.Err()
}

// CommentersOnPost returns the set of user ids that commented on a post.
func (r *PGRepo) CommentersOnPost(ctx context.Context, rmheetID string) (ids map[string]bool, err error) {
	defer func() { r.record(err) }()
	ids = map[string]bool{}
	qrows, err := r.db.Pool.Query(ctx, commentersOnPostQuery, rmheetID)
	if err != nil {
		return nil, fmt.Errorf("botworker: commenters on post: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var id string
		if err = qrows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = true
	}
	return ids, qrows.Err()
}

// ─── DM repo methods ───────────────────────────────────────────────────

// RecentBotConversations loads recent conversations with at least one bot.
func (r *PGRepo) RecentBotConversations(ctx context.Context, since time.Time) (rows []ConversationRow, err error) {
	defer func() { r.record(err) }()
	qrows, err := r.db.Pool.Query(ctx, recentBotConversationsQuery, since)
	if err != nil {
		return nil, fmt.Errorf("botworker: recent bot conversations: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var c ConversationRow
		if err = qrows.Scan(&c.ID, &c.ParticipantOneID, &c.ParticipantTwoID, &c.OneIsBot, &c.TwoIsBot); err != nil {
			return nil, fmt.Errorf("botworker: scan conversation: %w", err)
		}
		rows = append(rows, c)
	}
	return rows, qrows.Err()
}

// LastMessageSender returns the sender id of the latest message in a conversation.
func (r *PGRepo) LastMessageSender(ctx context.Context, conversationID string) (senderID string, err error) {
	defer func() { r.record(err) }()
	if scanErr := r.db.Pool.QueryRow(ctx, lastMessageSenderQuery, conversationID).Scan(&senderID); scanErr != nil {
		return "", nil // no messages
	}
	return senderID, nil
}

// RecentDMHistory returns the last 20 messages (newest first) of a conversation.
func (r *PGRepo) RecentDMHistory(ctx context.Context, conversationID string) (msgs []dmMessage, err error) {
	defer func() { r.record(err) }()
	qrows, err := r.db.Pool.Query(ctx, recentDMHistoryQuery, conversationID)
	if err != nil {
		return nil, fmt.Errorf("botworker: dm history: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var m dmMessage
		if err = qrows.Scan(&m.SenderID, &m.Content); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	return msgs, qrows.Err()
}

// SendBotDM inserts a DM and bumps the conversation in a transaction, returning
// the message payload for the SSE bridge. Mirrors Node sendBotDm().
func (r *PGRepo) SendBotDM(ctx context.Context, conversationID, botID, content string) (msg messagePayload, err error) {
	defer func() { r.record(err) }()
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return msg, fmt.Errorf("botworker: send dm begin: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	id := newCUID()
	var read bool
	var createdAt time.Time
	if err = tx.QueryRow(ctx, insertDirectMessageQuery, id, conversationID, botID, content).Scan(&id, &read, &createdAt); err != nil {
		return msg, fmt.Errorf("botworker: insert dm: %w", err)
	}
	if _, err = tx.Exec(ctx, bumpConversationQuery, conversationID); err != nil {
		return msg, fmt.Errorf("botworker: bump conversation: %w", err)
	}
	if err = tx.Commit(ctx); err != nil {
		return msg, fmt.Errorf("botworker: send dm commit: %w", err)
	}
	return messagePayload{
		ID:             id,
		ConversationID: conversationID,
		Content:        content,
		SenderID:       botID,
		Read:           read,
		CreatedAt:      createdAt.UTC().Format(time.RFC3339),
	}, nil
}

// DMPrivacy reads a human's DM privacy setting (defaults EVERYONE).
func (r *PGRepo) DMPrivacy(ctx context.Context, userID string) (privacy DmPrivacy, err error) {
	defer func() { r.record(err) }()
	var s string
	if scanErr := r.db.Pool.QueryRow(ctx, dmPrivacyQuery, userID).Scan(&s); scanErr != nil {
		return dmEveryone, nil // no profile row → default EVERYONE
	}
	return DmPrivacy(s), nil
}

// FollowExists checks whether followerID follows followingID.
func (r *PGRepo) FollowExists(ctx context.Context, followerID, followingID string) (exists bool, err error) {
	defer func() { r.record(err) }()
	if err = r.db.Pool.QueryRow(ctx, followExistsQuery, followerID, followingID).Scan(&exists); err != nil {
		return false, fmt.Errorf("botworker: follow exists: %w", err)
	}
	return exists, nil
}

// ConversationOpenerMessages returns the first 10 messages (oldest first) of an
// existing conversation between two ordered participants, or nil if none.
func (r *PGRepo) ConversationOpenerMessages(ctx context.Context, pOne, pTwo string) (convID string, msgs []policyMessage, err error) {
	defer func() { r.record(err) }()
	if scanErr := r.db.Pool.QueryRow(ctx, findConversationQuery, pOne, pTwo).Scan(&convID); scanErr != nil {
		return "", nil, nil // no conversation
	}
	qrows, err := r.db.Pool.Query(ctx, conversationOpenerMessagesQuery, convID)
	if err != nil {
		return convID, nil, fmt.Errorf("botworker: opener messages: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var m policyMessage
		if err = qrows.Scan(&m.SenderID, &m.CreatedAt); err != nil {
			return convID, nil, err
		}
		msgs = append(msgs, m)
	}
	return convID, msgs, qrows.Err()
}

// UpsertConversation creates (or finds) a conversation between two ordered
// participants and returns its id. Mirrors Node prisma.conversation.upsert().
func (r *PGRepo) UpsertConversation(ctx context.Context, pOne, pTwo string) (id string, err error) {
	defer func() { r.record(err) }()
	if err = r.db.Pool.QueryRow(ctx, upsertConversationQuery, newCUID(), pOne, pTwo).Scan(&id); err != nil {
		return "", fmt.Errorf("botworker: upsert conversation: %w", err)
	}
	return id, nil
}

// RecentActiveHumans returns distinct non-bot user ids active within the window.
func (r *PGRepo) RecentActiveHumans(ctx context.Context, since time.Time) (ids []string, err error) {
	defer func() { r.record(err) }()
	qrows, err := r.db.Pool.Query(ctx, recentActiveHumansQuery, since)
	if err != nil {
		return nil, fmt.Errorf("botworker: recent active humans: %w", err)
	}
	defer qrows.Close()
	for qrows.Next() {
		var id string
		if err = qrows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, qrows.Err()
}

// ReserveImageBudget atomically reserves one unit of today's global image budget.
// Returns true iff a slot was reserved (under cap). Fails closed on DB error.
func (r *PGRepo) ReserveImageBudget(ctx context.Context, day string, capLimit int) (reserved bool, err error) {
	defer func() { r.record(err) }()
	tag, err := r.db.Pool.Exec(ctx, reserveImageBudgetQuery, day, capLimit)
	if err != nil {
		return false, fmt.Errorf("botworker: reserve image budget: %w", err)
	}
	return tag.RowsAffected() == 1, nil
}
