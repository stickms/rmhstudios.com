package rmhmusic

import (
	"context"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// ─── room:create ─────────────────────────────────────────────────────────────

type createPayload struct {
	Name     string `json:"name"`
	IsPublic *bool  `json:"isPublic"`
	Password string `json:"password"`
}

// onCreate ports RoomManager.onCreate. Validates input, builds the room with the
// creator as host+first member, sends room:created + a full snapshot to the
// creator, joins the hub room, and persists the row fire-and-forget.
func (m *Manager) onCreate(c *realtime.Conn, e realtime.Envelope) {
	if m.roomForConn(c.ID) != nil {
		m.sendErr(c, "ALREADY_IN_ROOM", "Leave current room first")
		return
	}

	var p createPayload
	if err := e.Bind(&p); err != nil {
		m.sendErr(c, "INVALID_PAYLOAD", "Bad create payload")
		return
	}
	name := strings.TrimSpace(p.Name)
	if name == "" {
		name = displayName(c) + "'s Room"
	}
	name = trunc(name, nameMaxLength)
	if len(p.Password) > passwordMaxLength {
		m.sendErr(c, "INVALID_PAYLOAD", "Password too long")
		return
	}
	isPublic := true
	if p.IsPublic != nil {
		isPublic = *p.IsPublic
	}

	now := m.now()
	userID := c.UserID()
	room := &ServerRoom{
		ID:         generateRoomID(),
		Code:       generateRoomCode(),
		Name:       name,
		HostUserID: userID,
		IsPublic:   isPublic,
		Password:   p.Password,
		MaxMembers: defaultMaxMembers,
		Members:    make(map[string]*ServerMember),
		Playback:   Playback{UpdatedAt: now},
		CreatedAt:  now,

		LastActivityAt: now,
	}
	room.Members[userID] = &ServerMember{
		UserID:      userID,
		UserName:    displayName(c),
		AvatarURL:   c.Identity.Image,
		ConnID:      c.ID,
		IsConnected: true,
		JoinedAt:    now,
	}
	room.memberOrder = []string{userID}

	m.mu.Lock()
	m.rooms[room.ID] = room
	m.connToRoom[c.ID] = room.ID
	m.userToConn[userID] = c.ID
	m.mu.Unlock()

	m.hub.Join(c, room.ID)

	c.Send(realtime.MustEnvelope(s2cRoomCreated, map[string]any{"roomId": room.ID, "code": room.Code}))
	room.mu.Lock()
	snap := m.toClientState(room, userID)
	room.mu.Unlock()
	c.Send(realtime.MustEnvelope(s2cRoomStateSnapshot, snap))

	// Fire-and-forget persistence of the room row only (members/queue/chat stay
	// in memory — faithful to the Node service).
	m.persistRoom(room)

	m.logger.Info("room_created", "roomId", room.ID, "code", room.Code, "hostUserId", userID)
}

func (m *Manager) persistRoom(room *ServerRoom) {
	row := RoomRow{
		ID: room.ID, Code: room.Code, Name: room.Name, HostID: room.HostUserID,
		IsPublic: room.IsPublic, Password: strPtr(room.Password), MaxMembers: room.MaxMembers,
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := m.repo.CreateRoom(ctx, row); err != nil {
			m.logger.Error("db_create_room_failed", "error", err.Error(), "roomId", row.ID)
		}
	}()
}

// ─── room:join ───────────────────────────────────────────────────────────────

type joinPayload struct {
	Code     string `json:"code"`
	Password string `json:"password"`
}

// onJoin ports RoomManager.onJoin: code lookup, password + capacity checks,
// reconnect handling (cancels any pending grace removal), snapshot to joiner and
// MEMBER_JOINED delta for new members.
func (m *Manager) onJoin(c *realtime.Conn, e realtime.Envelope) {
	if m.roomForConn(c.ID) != nil {
		m.sendErr(c, "ALREADY_IN_ROOM", "Leave current room first")
		return
	}

	var p joinPayload
	if err := e.Bind(&p); err != nil {
		m.sendErr(c, "INVALID_PAYLOAD", "Bad join payload")
		return
	}
	code := strings.TrimSpace(p.Code)
	if code == "" || !isAlnum(code) || len(code) > 10 {
		m.sendErr(c, "INVALID_PAYLOAD", "Bad room code")
		return
	}

	room := m.findRoomByCode(code)
	if room == nil {
		m.sendErr(c, "ROOM_NOT_FOUND", "Room not found")
		return
	}

	userID := c.UserID()
	room.mu.Lock()
	if room.Password != "" && room.Password != p.Password {
		room.mu.Unlock()
		m.sendErr(c, "WRONG_PASSWORD", "Wrong password")
		return
	}
	existing, isReconnect := room.Members[userID]
	if !isReconnect && len(room.Members) >= room.MaxMembers {
		room.mu.Unlock()
		m.sendErr(c, "ROOM_FULL", "Room is full")
		return
	}

	if isReconnect {
		existing.ConnID = c.ID
		existing.IsConnected = true
		existing.DisconnectedAt = 0
	} else {
		room.Members[userID] = &ServerMember{
			UserID:      userID,
			UserName:    displayName(c),
			AvatarURL:   c.Identity.Image,
			ConnID:      c.ID,
			IsConnected: true,
			JoinedAt:    m.now(),
		}
		room.memberOrder = append(room.memberOrder, userID)
	}
	room.LastActivityAt = m.now()
	snap := m.toClientState(room, userID)
	room.mu.Unlock()

	// A reconnect within the grace window cancels the pending removal.
	m.timers.Cancel(graceKey(room.ID, userID))

	m.mu.Lock()
	m.connToRoom[c.ID] = room.ID
	m.userToConn[userID] = c.ID
	m.mu.Unlock()

	m.hub.Join(c, room.ID)

	c.Send(realtime.MustEnvelope(s2cRoomStateSnapshot, snap))

	if !isReconnect {
		room.mu.Lock()
		m.broadcastAction(room, actionMemberJoined, map[string]any{
			"userId": userID, "userName": displayName(c), "avatarUrl": nullable(c.Identity.Image),
		})
		room.mu.Unlock()
	}

	m.logger.Info("user_joined_room", "roomId", room.ID, "userId", userID)
}

// ─── room:leave ──────────────────────────────────────────────────────────────

func (m *Manager) onLeave(c *realtime.Conn, _ realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil {
		return
	}
	m.removeMember(c, room.ID, c.UserID())
}

// ─── disconnect ──────────────────────────────────────────────────────────────

// onDisconnect ports RoomManager.onDisconnect: mark the member disconnected,
// schedule grace removal, drop the conn->room mapping, broadcast
// MEMBER_DISCONNECTED. Removal is deferred so a reconnect can cancel it.
func (m *Manager) onDisconnect(c *realtime.Conn) {
	m.mu.Lock()
	roomID := m.connToRoom[c.ID]
	delete(m.connToRoom, c.ID)
	// Only clear userToConn if this is still the user's active conn.
	if m.userToConn[c.UserID()] == c.ID {
		delete(m.userToConn, c.UserID())
	}
	room := m.rooms[roomID]
	m.mu.Unlock()
	if room == nil {
		return
	}

	userID := c.UserID()
	room.mu.Lock()
	member, ok := room.Members[userID]
	if !ok || member.ConnID != c.ID {
		// Member already gone or replaced by a newer connection; nothing to do.
		room.mu.Unlock()
		return
	}
	member.IsConnected = false
	member.DisconnectedAt = m.now()
	m.broadcastAction(room, actionMemberDisconnected, map[string]any{"userId": userID})
	room.mu.Unlock()

	m.timers.Schedule(graceKey(roomID, userID), disconnectGrace, func() {
		m.mu.RLock()
		r := m.rooms[roomID]
		m.mu.RUnlock()
		if r == nil {
			return
		}
		r.mu.Lock()
		mm, ok := r.Members[userID]
		stillGone := ok && !mm.IsConnected
		r.mu.Unlock()
		if stillGone {
			m.removeMember(nil, roomID, userID)
		}
	})
}

// removeMember ports RoomManager.removeMember: drop the member, delete the room
// if empty, otherwise broadcast MEMBER_LEFT and auto-reassign the host to the
// first remaining member when the host left. conn may be nil (grace-timer path).
func (m *Manager) removeMember(conn *realtime.Conn, roomID, userID string) {
	m.mu.RLock()
	room := m.rooms[roomID]
	m.mu.RUnlock()
	if room == nil {
		return
	}

	if conn != nil {
		m.hub.Leave(conn, roomID)
		m.mu.Lock()
		delete(m.connToRoom, conn.ID)
		m.mu.Unlock()
	}

	room.mu.Lock()
	if _, ok := room.Members[userID]; !ok {
		room.mu.Unlock()
		return
	}
	delete(room.Members, userID)
	room.memberOrder = removeStr(room.memberOrder, userID)
	empty := len(room.Members) == 0
	hostLeft := room.HostUserID == userID
	room.LastActivityAt = m.now()
	room.mu.Unlock()

	if empty {
		m.mu.Lock()
		delete(m.rooms, roomID)
		m.mu.Unlock()
		m.logger.Info("room_deleted_empty", "roomId", roomID)
		return
	}

	room.mu.Lock()
	m.broadcastAction(room, actionMemberLeft, map[string]any{"userId": userID})
	if hostLeft {
		if newHost := room.firstMember(); newHost != nil {
			room.HostUserID = newHost.UserID
			m.broadcastAction(room, actionHostTransferred, map[string]any{
				"newHostUserId": newHost.UserID, "newHostUserName": newHost.UserName,
			})
		}
	}
	room.mu.Unlock()
}

// ─── room:transfer_host ──────────────────────────────────────────────────────

type transferPayload struct {
	TargetUserID string `json:"targetUserId"`
}

func (m *Manager) onTransferHost(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil {
		m.sendErr(c, "NOT_IN_ROOM", "Not in a room")
		return
	}
	var p transferPayload
	if err := e.Bind(&p); err != nil || p.TargetUserID == "" {
		m.sendErr(c, "INVALID_PAYLOAD", "Bad transfer payload")
		return
	}

	room.mu.Lock()
	if room.HostUserID != c.UserID() {
		room.mu.Unlock()
		m.sendErr(c, "NOT_HOST", "Only the host can transfer")
		return
	}
	target, ok := room.Members[p.TargetUserID]
	if !ok {
		room.mu.Unlock()
		m.sendErr(c, "INVALID_PAYLOAD", "User not in room")
		return
	}
	room.HostUserID = target.UserID
	m.broadcastAction(room, actionHostTransferred, map[string]any{
		"newHostUserId": target.UserID, "newHostUserName": target.UserName,
	})
	room.mu.Unlock()
}

// ─── room:browse ─────────────────────────────────────────────────────────────

type browsePayload struct {
	Limit *int `json:"limit"`
}

func (m *Manager) onBrowse(c *realtime.Conn, e realtime.Envelope) {
	var p browsePayload
	_ = e.Bind(&p)
	limit := browseDefaultLimit
	if p.Limit != nil {
		limit = *p.Limit
	}
	if limit < 1 {
		limit = 1
	}
	if limit > browseMaxLimit {
		limit = browseMaxLimit
	}

	m.mu.RLock()
	rooms := make([]*ServerRoom, 0, len(m.rooms))
	for _, r := range m.rooms {
		rooms = append(rooms, r)
	}
	m.mu.RUnlock()

	out := make([]map[string]any, 0, limit)
	for _, room := range rooms {
		room.mu.Lock()
		if !room.IsPublic {
			room.mu.Unlock()
			continue
		}
		hostName := "Unknown"
		if h, ok := room.Members[room.HostUserID]; ok {
			hostName = h.UserName
		}
		var current any
		if room.CurrentTrack != nil {
			current = room.CurrentTrack.Title
		}
		out = append(out, map[string]any{
			"roomId":       room.ID,
			"code":         room.Code,
			"name":         room.Name,
			"hostName":     hostName,
			"memberCount":  len(room.Members),
			"maxMembers":   room.MaxMembers,
			"currentTrack": current,
			"hasPassword":  room.Password != "",
		})
		room.mu.Unlock()
		if len(out) >= limit {
			break
		}
	}
	c.Send(realtime.MustEnvelope(s2cRoomBrowseResult, map[string]any{"rooms": out}))
}

// ─── snapshot ────────────────────────────────────────────────────────────────

// toClientState ports RoomManager.toClientState. Caller holds room.mu. The
// playback head is returned as-stored (positionMs/updatedAt); the client applies
// drift correction, and the periodic sync:heartbeat carries the projected value.
func (m *Manager) toClientState(room *ServerRoom, userID string) map[string]any {
	members := make([]map[string]any, 0, len(room.Members))
	for _, uid := range room.memberOrder {
		mm := room.Members[uid]
		if mm == nil {
			continue
		}
		members = append(members, map[string]any{
			"userId":      mm.UserID,
			"userName":    mm.UserName,
			"avatarUrl":   nullable(mm.AvatarURL),
			"isConnected": mm.IsConnected,
			"isHost":      mm.UserID == room.HostUserID,
		})
	}

	chat := room.Chat
	if len(chat) > chatHistoryLength {
		chat = chat[len(chat)-chatHistoryLength:]
	}

	return map[string]any{
		"roomId":     room.ID,
		"code":       room.Code,
		"name":       room.Name,
		"hostUserId": room.HostUserID,
		"settings": map[string]any{
			"isPublic":   room.IsPublic,
			"maxMembers": room.MaxMembers,
			"password":   nil, // never leak the password in snapshots
		},
		"members":      members,
		"queue":        room.Queue,
		"currentTrack": room.CurrentTrack,
		"playback":     room.Playback,
		"chat":         chat,
		"myUserId":     userID,
		"seq":          room.Seq,
	}
}

// ─── lookups & helpers ───────────────────────────────────────────────────────

func (m *Manager) findRoomByCode(code string) *ServerRoom {
	want := strings.ToUpper(code)
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.rooms {
		if strings.ToUpper(r.Code) == want {
			return r
		}
	}
	return nil
}

// firstMember returns the first member in insertion order (host reassignment
// target), matching `room.members.values().next().value` over an insertion-
// ordered JS Map.
func (r *ServerRoom) firstMember() *ServerMember {
	for _, uid := range r.memberOrder {
		if mm, ok := r.Members[uid]; ok {
			return mm
		}
	}
	return nil
}

func graceKey(roomID, userID string) string { return roomID + "|" + userID }

func displayName(c *realtime.Conn) string {
	if c.Identity.Name != "" {
		return c.Identity.Name
	}
	return "User"
}

// nullable renders "" as JSON null and any other string as itself.
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func isAlnum(s string) bool {
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

func removeStr(ss []string, v string) []string {
	out := ss[:0]
	for _, s := range ss {
		if s != v {
			out = append(out, s)
		}
	}
	return out
}

// runGC ports RoomManager.startGC: reap rooms that have been empty past the
// timeout. (Empty rooms are normally deleted immediately on last-member removal;
// this is the safety-net sweep, faithful to the Node interval.)
func (m *Manager) runGC(ctx context.Context) {
	t := time.NewTicker(gcInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopCh:
			return
		case <-t.C:
			now := m.now()
			m.mu.Lock()
			for id, room := range m.rooms {
				room.mu.Lock()
				empty := len(room.Members) == 0
				stale := now-room.LastActivityAt > emptyRoomTimeout.Milliseconds()
				room.mu.Unlock()
				if empty && stale {
					delete(m.rooms, id)
					m.logger.Info("gc_removed_empty_room", "roomId", id)
				}
			}
			m.mu.Unlock()
		}
	}
}
