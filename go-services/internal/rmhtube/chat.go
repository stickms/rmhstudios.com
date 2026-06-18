package rmhtube

import (
	"context"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Faithful port of server/rmhtube/chat-handler.ts: chat send (with replies,
// mentions, shared timestamp), typing indicators, chat reactions, pinned msgs.

func (m *Manager) onChat(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Content   string   `json:"content"`
		ReplyToID string   `json:"replyToId"`
		Mentions  []string `json:"mentions"`
		Timestamp *float64 `json:"timestamp"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	r := ent.r
	content := sanitizeString(p.Content, chatMaxLength)
	if content == "" {
		ent.mu.Unlock()
		return
	}

	// Reply resolution.
	var replyToID, replyToContent, replyToUserName string
	if p.ReplyToID != "" {
		for _, msg := range r.Chat {
			if msg.ID == p.ReplyToID {
				replyToID = msg.ID
				rc := msg.Content
				if len(rc) > 80 {
					rc = rc[:80]
				}
				replyToContent = rc
				replyToUserName = msg.UserName
				break
			}
		}
	}

	// Mention validation: only keep mentions of current members.
	var mentions []string
	for _, mid := range p.Mentions {
		if _, ok := r.Members[mid]; ok {
			mentions = append(mentions, mid)
		}
	}

	now := nowMs()
	msg := &chatMessage{
		ID: nanoid(12), UserID: userID, UserName: nameOf(c), Content: content,
		CreatedAt: now, ReplyToID: replyToID, ReplyToContent: replyToContent,
		ReplyToUserName: replyToUserName, Mentions: mentions, Timestamp: p.Timestamp,
	}
	r.Chat = append(r.Chat, msg)
	if len(r.Chat) > chatHistoryLength {
		r.Chat = r.Chat[len(r.Chat)-chatHistoryLength:]
	}
	r.LastActivity = now
	m.broadcastAction(r, "CHAT_MESSAGE", chatPayload(r, msg))
	roomID := r.ID
	ent.mu.Unlock()

	go m.persistChat(roomID, msg)
}

func (m *Manager) onTyping(c *realtime.Conn, _ realtime.Envelope) {
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	r := ent.r
	if t, ok := r.TypingTimers[userID]; ok {
		t.Stop()
	}
	roomID := r.ID
	r.TypingTimers[userID] = time.AfterFunc(typingTimeout, func() {
		ent.mu.Lock()
		delete(ent.r.TypingTimers, userID)
		ent.mu.Unlock()
	})
	uname := nameOf(c)
	ent.mu.Unlock()

	m.broadcastExcept(roomID, c.ID, s2cChatTypingIndicator, map[string]any{
		"userId": userID, "userName": uname,
	})
}

func (m *Manager) onChatReact(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		MessageID string `json:"messageId"`
		Emoji     string `json:"emoji"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	defer ent.mu.Unlock()
	r := ent.r

	exists := false
	for _, msg := range r.Chat {
		if msg.ID == p.MessageID {
			exists = true
			break
		}
	}
	if !exists {
		return
	}

	msgReactions := r.ChatReactions[p.MessageID]
	if msgReactions == nil {
		msgReactions = map[string]map[string]struct{}{}
		r.ChatReactions[p.MessageID] = msgReactions
	}
	users := msgReactions[p.Emoji]
	if users == nil {
		users = map[string]struct{}{}
		msgReactions[p.Emoji] = users
	}
	if _, ok := users[userID]; ok {
		delete(users, userID)
		if len(users) == 0 {
			delete(msgReactions, p.Emoji)
		}
		if len(msgReactions) == 0 {
			delete(r.ChatReactions, p.MessageID)
		}
	} else {
		users[userID] = struct{}{}
	}

	// Serialize current reactions for this message.
	reactions := map[string][]string{}
	for emoji, set := range r.ChatReactions[p.MessageID] {
		list := make([]string, 0, len(set))
		for uid := range set {
			list = append(list, uid)
		}
		reactions[emoji] = list
	}
	m.broadcastAction(r, "CHAT_REACTION", map[string]any{"messageId": p.MessageID, "reactions": reactions})
}

func (m *Manager) onChatPin(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		MessageID *string `json:"messageId"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	defer ent.mu.Unlock()
	r := ent.r
	if r.HostUserID != userID {
		sendErr(c, "NOT_HOST", "Only the host can pin messages.")
		return
	}
	if p.MessageID == nil {
		r.PinnedMessage = nil
		m.broadcastAction(r, "MESSAGE_UNPINNED", map[string]any{})
		return
	}
	var found *chatMessage
	for _, msg := range r.Chat {
		if msg.ID == *p.MessageID {
			found = msg
			break
		}
	}
	if found == nil {
		sendErr(c, "MESSAGE_NOT_FOUND", "Message not found.")
		return
	}
	r.PinnedMessage = found
	m.broadcastAction(r, "MESSAGE_PINNED", map[string]any{"message": chatPayload(r, found)})
}

// persistChat is the fire-and-forget chat DB write. A Repo may opt in to chat
// persistence by implementing chatWriter; otherwise it is a no-op (the in-memory
// ring buffer remains authoritative for live rooms either way).
//
// TODO(migration): the legacy server persisted each message to a
// "rmhtube_chat_message" table and restored the last CHAT_HISTORY_LENGTH rows.
// The required Repo interface deliberately covers the room/member/queue restore
// set (the load-bearing path); chat persistence is wired as an optional
// extension so it can be added without touching the room logic.
func (m *Manager) persistChat(roomID string, msg *chatMessage) {
	if cw, ok := m.repo.(chatWriter); ok {
		m.persist("chat_persist", func() error { return cw.ChatAdd(m.ctx, roomID, msg) })
	}
}

// chatWriter is an optional extension a Repo may implement to persist chat.
type chatWriter interface {
	ChatAdd(ctx context.Context, roomID string, msg *chatMessage) error
}
