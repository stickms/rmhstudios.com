package rmhmusic

import "github.com/rmhstudios/rmh-go/pkg/realtime"

// Chat — ports server/rmhmusic/chat-handler.ts. Sanitizes + truncates content,
// appends to the bounded ring buffer, and broadcasts a CHAT_MESSAGE delta.

type chatPayload struct {
	Content string `json:"content"`
}

func (m *Manager) onChat(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil {
		return
	}
	var p chatPayload
	if err := e.Bind(&p); err != nil {
		return
	}

	userID := c.UserID()
	room.mu.Lock()
	member, ok := room.Members[userID]
	if !ok {
		room.mu.Unlock()
		return
	}
	content := sanitizeString(p.Content, chatMaxLength)
	if content == "" {
		room.mu.Unlock()
		return
	}
	msg := ChatMessage{
		ID:        generateItemID(),
		UserID:    member.UserID,
		UserName:  member.UserName,
		Content:   content,
		CreatedAt: m.now(),
	}
	room.Chat = append(room.Chat, msg)
	if len(room.Chat) > chatHistoryLength {
		room.Chat = room.Chat[len(room.Chat)-chatHistoryLength:]
	}
	m.broadcastAction(room, actionChatMessage, msg)
	room.mu.Unlock()
}
