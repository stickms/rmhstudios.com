package rmhmusic

import "github.com/rmhstudios/rmh-go/pkg/realtime"

// Queue management — ports server/rmhmusic/queue-manager.ts. Any member (not
// just the host) may add/remove/reorder, matching the Node QueueManager.

type queueAddPayload struct {
	SpotifyURI string `json:"spotifyUri"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	AlbumArt   string `json:"albumArt"`
	DurationMs int64  `json:"durationMs"`
	PreviewURL string `json:"previewUrl"`
}

func (m *Manager) onQueueAdd(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil {
		return
	}
	var p queueAddPayload
	if err := e.Bind(&p); err != nil || p.SpotifyURI == "" || p.DurationMs < 0 {
		m.sendErr(c, "INVALID_PAYLOAD", "Bad queue item")
		return
	}

	userID := c.UserID()
	room.mu.Lock()
	if len(room.Queue) >= maxQueueSize {
		room.mu.Unlock()
		m.sendErr(c, "QUEUE_FULL", "Queue is full")
		return
	}
	addedByName := "Unknown"
	if mm, ok := room.Members[userID]; ok {
		addedByName = mm.UserName
	}
	item := &ServerQueueItem{
		ID:          generateItemID(),
		SpotifyURI:  p.SpotifyURI,
		Title:       trunc(p.Title, 256),
		Artist:      trunc(p.Artist, 256),
		AlbumArt:    p.AlbumArt,
		DurationMs:  p.DurationMs,
		PreviewURL:  p.PreviewURL,
		AddedByID:   userID,
		AddedByName: addedByName,
		Position:    len(room.Queue),
		AddedAt:     m.now(),
	}
	room.Queue = append(room.Queue, item)
	queueSnapshot := room.Queue
	room.mu.Unlock()

	m.broadcast(room.ID, s2cQueueUpdated, map[string]any{"queue": queueSnapshot})

	room.mu.Lock()
	m.broadcastAction(room, actionQueueItemAdded, map[string]any{"item": item})
	room.mu.Unlock()
}

type queueRemovePayload struct {
	ItemID string `json:"itemId"`
}

func (m *Manager) onQueueRemove(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil {
		return
	}
	var p queueRemovePayload
	if err := e.Bind(&p); err != nil || p.ItemID == "" {
		return
	}

	room.mu.Lock()
	idx := indexOf(room.Queue, p.ItemID)
	if idx == -1 {
		room.mu.Unlock()
		return
	}
	room.Queue = append(room.Queue[:idx], room.Queue[idx+1:]...)
	reindex(room.Queue)
	queueSnapshot := room.Queue
	room.mu.Unlock()

	m.broadcast(room.ID, s2cQueueUpdated, map[string]any{"queue": queueSnapshot})
}

type queueReorderPayload struct {
	ItemID      string `json:"itemId"`
	NewPosition int    `json:"newPosition"`
}

func (m *Manager) onQueueReorder(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil {
		return
	}
	var p queueReorderPayload
	if err := e.Bind(&p); err != nil || p.ItemID == "" || p.NewPosition < 0 {
		return
	}

	room.mu.Lock()
	idx := indexOf(room.Queue, p.ItemID)
	if idx == -1 {
		room.mu.Unlock()
		return
	}
	item := room.Queue[idx]
	room.Queue = append(room.Queue[:idx], room.Queue[idx+1:]...)
	pos := p.NewPosition
	if pos > len(room.Queue) {
		pos = len(room.Queue)
	}
	room.Queue = append(room.Queue[:pos], append([]*ServerQueueItem{item}, room.Queue[pos:]...)...)
	reindex(room.Queue)
	queueSnapshot := room.Queue
	room.mu.Unlock()

	m.broadcast(room.ID, s2cQueueUpdated, map[string]any{"queue": queueSnapshot})
}

func indexOf(q []*ServerQueueItem, id string) int {
	for i, item := range q {
		if item.ID == id {
			return i
		}
	}
	return -1
}
