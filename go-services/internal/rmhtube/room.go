package rmhtube

import (
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Faithful port of server/rmhtube/room-manager.ts. Every handler acquires the
// per-room lock for the duration of its mutation, then releases before any
// websocket send / DB call.

// ─── Create ──────────────────────────────────────────────────────────────────

func (m *Manager) onRoomCreate(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Name     string `json:"name"`
		Settings *struct {
			IsPublic         *bool    `json:"isPublic"`
			MaxMembers       *int     `json:"maxMembers"`
			AllowMemberQueue *bool    `json:"allowMemberQueue"`
			AllowMemberSkip  *bool    `json:"allowMemberSkip"`
			AutoPlay         *bool    `json:"autoPlay"`
			Password         *string  `json:"password"`
			QueueVoting      *bool    `json:"queueVoting"`
			AutoSortByVotes  *bool    `json:"autoSortByVotes"`
			LoopQueue        *bool    `json:"loopQueue"`
			CustomReactions  []string `json:"customReactions"`
		} `json:"settings"`
	}
	_ = e.Bind(&p)

	userID := userOf(c)

	// If the user is already in a room, leave it first.
	if prev, ok := m.entryForUser(userID); ok {
		m.removeMember(prev, userID, reasonLeft)
	}

	// Defaults (port of the ?? fallbacks).
	s := roomSettings{
		IsPublic: true, MaxMembers: defaultMaxMembers,
		AllowMemberQueue: true, AllowMemberSkip: true, AutoPlay: true,
	}
	if ps := p.Settings; ps != nil {
		if ps.IsPublic != nil {
			s.IsPublic = *ps.IsPublic
		}
		if ps.MaxMembers != nil {
			s.MaxMembers = min(*ps.MaxMembers, absoluteMaxMembers)
		}
		if ps.AllowMemberQueue != nil {
			s.AllowMemberQueue = *ps.AllowMemberQueue
		}
		if ps.AllowMemberSkip != nil {
			s.AllowMemberSkip = *ps.AllowMemberSkip
		}
		if ps.AutoPlay != nil {
			s.AutoPlay = *ps.AutoPlay
		}
		if ps.Password != nil {
			s.Password = *ps.Password
		}
		if ps.QueueVoting != nil {
			s.QueueVoting = *ps.QueueVoting
		}
		if ps.AutoSortByVotes != nil {
			s.AutoSortByVotes = *ps.AutoSortByVotes
		}
		if ps.LoopQueue != nil {
			s.LoopQueue = *ps.LoopQueue
		}
		s.CustomReactions = ps.CustomReactions
	}

	// Unique room code (up to 10 attempts, mirroring the TS loop).
	roomID := generateRoomCode()
	for i := 0; i < 10; i++ {
		if _, exists := m.entry(roomID); !exists {
			break
		}
		roomID = generateRoomCode()
	}

	now := nowMs()
	name := ""
	if p.Name != "" {
		name = sanitizeString(p.Name, 64)
	}
	host := &member{
		UserID: userID, UserName: nameOf(c), AvatarURL: avatarOf(c),
		ConnID: c.ID, IsConnected: true, JoinedAt: now, LastSeenAt: now,
		Role: "host", Status: "watching",
	}
	r := &room{
		ID: roomID, Name: name, HostUserID: userID, LeaderUserID: userID,
		Settings: s, Members: map[string]*member{userID: host},
		CurrentIndex: -1,
		VideoState:   videoState{PlaybackRate: 1, UpdatedAt: now},
		SkipVotes:    map[string]struct{}{},
		CreatedAt:    now, LastActivity: now,
		TypingTimers:  map[string]*time.Timer{},
		ChatReactions: map[string]map[string]map[string]struct{}{},
		QueueVotes:    map[string]map[string]struct{}{},
	}
	ent := &roomEntry{r: r}

	m.mu.Lock()
	m.rooms[roomID] = ent
	m.userRoomIndex[userID] = roomID
	m.mu.Unlock()

	m.hub.Join(c, roomID)

	go m.persist("room_create", func() error { return m.repo.CreateRoom(m.ctx, r) })

	c.Send(realtime.MustEnvelope(s2cRoomCreated, map[string]any{"roomId": roomID}))
	c.Send(realtime.MustEnvelope(s2cRoomStateSnapshot, m.buildClientState(r, userID)))
	m.logger.Info("room_created", "roomId", roomID, "userId", userID)
}

// ─── Join ────────────────────────────────────────────────────────────────────

func (m *Manager) onRoomJoin(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		RoomID   string `json:"roomId"`
		Password string `json:"password"`
	}
	if err := e.Bind(&p); err != nil || p.RoomID == "" {
		return
	}
	roomID := strings.ToUpper(p.RoomID)
	userID := userOf(c)

	// Already tracked somewhere?
	m.mu.Lock()
	existing, tracked := m.userRoomIndex[userID]
	m.mu.Unlock()
	if tracked {
		if existing == roomID {
			if m.rejoin(c, roomID, userID) {
				return
			}
			// Stale index — clean up and fall through to a fresh join.
			m.mu.Lock()
			delete(m.userRoomIndex, userID)
			m.mu.Unlock()
		} else if ee, ok := m.entry(existing); ok {
			m.removeMember(ee, userID, reasonLeft)
		}
	}

	ent, ok := m.entry(roomID)
	if !ok {
		// Try loading from DB on demand.
		if loaded := m.loadRoomFromDB(roomID); loaded != nil {
			ent, ok = loaded, true
		}
	}
	if !ok {
		sendErr(c, "ROOM_NOT_FOUND", "Room not found.")
		return
	}

	ent.mu.Lock()
	r := ent.r
	// Re-verify the room is still registered: a concurrent disbandRoom may have
	// deleted it from m.rooms while we were blocked on ent.mu. Adding a member to
	// a disbanded entry would strand it (no longer reachable, never cleaned up).
	if cur, live := m.entry(roomID); !live || cur != ent {
		ent.mu.Unlock()
		sendErr(c, "ROOM_NOT_FOUND", "Room not found.")
		return
	}
	// Ban check.
	for _, b := range r.BannedUsers {
		if b.UserID == userID {
			ent.mu.Unlock()
			sendErr(c, "BANNED", "You are banned from this room.")
			return
		}
	}
	if r.Settings.Password != "" && r.Settings.Password != p.Password {
		ent.mu.Unlock()
		sendErr(c, "WRONG_PASSWORD", "Incorrect room password.")
		return
	}
	if r.activeCount() >= r.Settings.MaxMembers {
		ent.mu.Unlock()
		sendErr(c, "ROOM_FULL", "Room is full.")
		return
	}

	now := nowMs()
	isReturningHost := r.HostUserID == userID
	role := "member"
	if isReturningHost {
		role = "host"
	}
	r.Members[userID] = &member{
		UserID: userID, UserName: nameOf(c), AvatarURL: avatarOf(c),
		ConnID: c.ID, IsConnected: true, JoinedAt: now, LastSeenAt: now,
		Role: role, Status: "watching",
	}
	r.LastActivity = now
	snap := m.buildClientState(r, userID)
	uname, avatar := nameOf(c), avatarOf(c)
	m.broadcastAction(r, "MEMBER_JOINED", map[string]any{"userId": userID, "userName": uname, "avatarUrl": nullable(avatar)})
	ent.mu.Unlock()

	m.mu.Lock()
	m.userRoomIndex[userID] = roomID
	m.mu.Unlock()

	m.hub.Join(c, roomID)
	go m.persist("member_join", func() error { return m.repo.MemberJoin(m.ctx, roomID, userID) })

	c.Send(realtime.MustEnvelope(s2cRoomStateSnapshot, snap))
	m.logger.Info("member_joined", "roomId", roomID, "userId", userID)
}

// rejoin handles same-room reconnect/refresh: clears grace, refreshes the member,
// sends a fresh snapshot. Returns false if the room/member vanished (stale index).
func (m *Manager) rejoin(c *realtime.Conn, roomID, userID string) bool {
	ent, ok := m.entry(roomID)
	if !ok {
		return false
	}
	ent.mu.Lock()
	r := ent.r
	mem, ok := r.Members[userID]
	if !ok {
		ent.mu.Unlock()
		return false
	}
	m.grace.Cancel(graceKey(roomID, userID))
	mem.ConnID = c.ID
	mem.IsConnected = true
	mem.LastSeenAt = nowMs()
	r.LastActivity = nowMs()
	snap := m.buildClientState(r, userID)
	m.broadcastAction(r, "MEMBER_CONNECTED", map[string]any{"userId": userID})
	ent.mu.Unlock()

	m.hub.Join(c, roomID)
	c.Send(realtime.MustEnvelope(s2cRoomStateSnapshot, snap))
	m.logger.Info("member_rejoined", "roomId", roomID, "userId", userID)
	return true
}

// ─── Leave / disconnect / remove ─────────────────────────────────────────────

func (m *Manager) onRoomLeave(c *realtime.Conn, _ realtime.Envelope) {
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	m.removeMember(ent, userID, reasonLeft)
	m.hub.Leave(c, ent.r.ID)
}

// handleDisconnect marks the member disconnected and arms the 120s grace timer
// (ports handleDisconnect + the setTimeout-based grace, now via GraceTimers).
func (m *Manager) handleDisconnect(c *realtime.Conn) {
	userID := userOf(c)
	m.mu.Lock()
	delete(m.userConns, userID)
	m.mu.Unlock()

	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	r := ent.r
	mem, ok := r.Members[userID]
	if !ok || mem.ConnID != c.ID {
		// A newer connection replaced this one; ignore the stale disconnect.
		ent.mu.Unlock()
		return
	}
	mem.IsConnected = false
	mem.ConnID = ""
	r.LastActivity = nowMs()
	roomID := r.ID
	m.broadcastAction(r, "MEMBER_DISCONNECTED", map[string]any{"userId": userID})
	ent.mu.Unlock()

	m.grace.Schedule(graceKey(roomID, userID), disconnectGrace, func() {
		if e, ok := m.entry(roomID); ok {
			m.removeMember(e, userID, reasonGraceExpired)
		}
	})
	m.logger.Info("member_disconnected", "roomId", roomID, "userId", userID)
}

const (
	reasonLeft         = "left"
	reasonKicked       = "kicked"
	reasonGraceExpired = "grace_expired"
)

// removeMember ports removeMember: drops the member, cleans indexes, transfers
// host/leader, and schedules disband when the room empties.
func (m *Manager) removeMember(ent *roomEntry, userID, reason string) {
	ent.mu.Lock()
	r := ent.r
	mem, ok := r.Members[userID]
	if !ok {
		ent.mu.Unlock()
		return
	}
	roomID := r.ID
	m.grace.Cancel(graceKey(roomID, userID))
	delete(r.Members, userID)
	// Prune the departing user's votes so vote-skip / queue-vote thresholds are
	// computed only against still-present members (votesNeeded uses activeCount).
	delete(r.SkipVotes, userID)
	for itemID, voters := range r.QueueVotes {
		delete(voters, userID)
		if len(voters) == 0 {
			delete(r.QueueVotes, itemID)
		}
	}
	r.LastActivity = nowMs()
	_ = mem

	m.mu.Lock()
	delete(m.userRoomIndex, userID)
	m.mu.Unlock()

	go m.persist("member_leave", func() error { return m.repo.MemberLeave(m.ctx, roomID, userID) })

	if len(r.Members) == 0 {
		ent.mu.Unlock()
		// Schedule empty-room cleanup (GraceTimers keyed on the room).
		m.grace.Schedule("empty:"+roomID, roomEmptyTimeout, func() {
			if e, ok := m.entry(roomID); ok {
				e.mu.Lock()
				empty := len(e.r.Members) == 0
				e.mu.Unlock()
				if empty {
					m.disbandRoom(roomID, "empty")
				}
			}
		})
		return
	}

	action := "MEMBER_LEFT"
	if reason == reasonKicked {
		action = "MEMBER_KICKED"
	}
	m.broadcastAction(r, action, map[string]any{"userId": userID})

	// Host transfer.
	if userID == r.HostUserID {
		if next := r.longestConnected(); next != nil {
			r.HostUserID = next.UserID
			next.Role = "host"
			r.LeaderUserID = next.UserID
			m.broadcastAction(r, "HOST_TRANSFERRED", map[string]any{
				"newHostUserId": next.UserID, "newHostUserName": next.UserName,
				"newLeaderUserId": next.UserID,
			})
			nh := next.UserID
			go m.persist("host_transfer", func() error { return m.repo.UpdateHost(m.ctx, roomID, nh) })
		}
	} else if userID == r.LeaderUserID {
		var next *member
		if host, ok := r.Members[r.HostUserID]; ok && host.IsConnected {
			next = host
		} else {
			next = r.longestConnected()
		}
		if next != nil {
			r.LeaderUserID = next.UserID
			m.broadcastAction(r, "LEADER_CHANGED", map[string]any{
				"newLeaderUserId": next.UserID, "newLeaderUserName": next.UserName,
			})
		}
	}
	ent.mu.Unlock()
	m.logger.Info("member_removed", "roomId", roomID, "userId", userID, "reason", reason)
}

// ─── Kick / transfer / settings ──────────────────────────────────────────────

func (m *Manager) onRoomKick(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		TargetUserID string `json:"targetUserId"`
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
	if r.HostUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "Only the host can kick members.")
		return
	}
	_, exists := r.Members[p.TargetUserID]
	ent.mu.Unlock()
	if !exists || p.TargetUserID == userID {
		return
	}
	// Notify the kicked user.
	if tc, ok := m.connOf(p.TargetUserID); ok {
		tc.Send(realtime.MustEnvelope(s2cRoomKicked, map[string]any{}))
		m.hub.Leave(tc, ent.r.ID)
	}
	m.removeMember(ent, p.TargetUserID, reasonKicked)
}

func (m *Manager) onTransferHost(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		TargetUserID string `json:"targetUserId"`
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
	if r.HostUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "Only the host can transfer host.")
		return
	}
	target, ok := r.Members[p.TargetUserID]
	if !ok {
		ent.mu.Unlock()
		return
	}
	if old, ok := r.Members[userID]; ok {
		old.Role = "member"
	}
	target.Role = "host"
	r.HostUserID = p.TargetUserID
	r.LeaderUserID = p.TargetUserID
	m.broadcastAction(r, "HOST_TRANSFERRED", map[string]any{
		"newHostUserId": p.TargetUserID, "newHostUserName": target.UserName,
		"newLeaderUserId": p.TargetUserID,
	})
	roomID, nh := r.ID, p.TargetUserID
	ent.mu.Unlock()
	go m.persist("host_transfer", func() error { return m.repo.UpdateHost(m.ctx, roomID, nh) })
}

func (m *Manager) onUpdateSettings(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Settings struct {
			IsPublic         *bool    `json:"isPublic"`
			MaxMembers       *int     `json:"maxMembers"`
			AllowMemberQueue *bool    `json:"allowMemberQueue"`
			AllowMemberSkip  *bool    `json:"allowMemberSkip"`
			AutoPlay         *bool    `json:"autoPlay"`
			Password         *string  `json:"password"`
			QueueVoting      *bool    `json:"queueVoting"`
			AutoSortByVotes  *bool    `json:"autoSortByVotes"`
			LoopQueue        *bool    `json:"loopQueue"`
			CustomReactions  []string `json:"customReactions"`
		} `json:"settings"`
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
	if r.HostUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "Only the host can update settings.")
		return
	}
	s := &r.Settings
	ps := p.Settings
	if ps.IsPublic != nil {
		s.IsPublic = *ps.IsPublic
	}
	if ps.MaxMembers != nil {
		s.MaxMembers = min(*ps.MaxMembers, absoluteMaxMembers)
	}
	if ps.AllowMemberQueue != nil {
		s.AllowMemberQueue = *ps.AllowMemberQueue
	}
	if ps.AllowMemberSkip != nil {
		s.AllowMemberSkip = *ps.AllowMemberSkip
	}
	if ps.AutoPlay != nil {
		s.AutoPlay = *ps.AutoPlay
	}
	if ps.Password != nil {
		s.Password = *ps.Password
	}
	if ps.QueueVoting != nil {
		s.QueueVoting = *ps.QueueVoting
	}
	if ps.AutoSortByVotes != nil {
		s.AutoSortByVotes = *ps.AutoSortByVotes
	}
	if ps.LoopQueue != nil {
		s.LoopQueue = *ps.LoopQueue
	}
	if ps.CustomReactions != nil {
		s.CustomReactions = ps.CustomReactions
	}
	r.LastActivity = nowMs()
	m.broadcastAction(r, "SETTINGS_UPDATED", settingsPayload(*s))
	roomID, snap := r.ID, *s
	ent.mu.Unlock()
	go m.persist("settings_update", func() error { return m.repo.UpdateSettings(m.ctx, roomID, snap) })
}

// ─── Leader / status ─────────────────────────────────────────────────────────

func (m *Manager) onSetLeader(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		TargetUserID string `json:"targetUserId"`
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
	if r.LeaderUserID != userID && r.HostUserID != userID {
		sendErr(c, "NOT_LEADER", "Only the current leader or host can transfer leadership.")
		return
	}
	target, ok := r.Members[p.TargetUserID]
	if !ok {
		return
	}
	r.LeaderUserID = p.TargetUserID
	r.LastActivity = nowMs()
	m.broadcastAction(r, "LEADER_CHANGED", map[string]any{
		"newLeaderUserId": p.TargetUserID, "newLeaderUserName": target.UserName,
	})
}

func (m *Manager) onSetStatus(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Status string `json:"status"`
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
	mem, ok := r.Members[userID]
	if !ok {
		return
	}
	mem.Status = p.Status
	r.LastActivity = nowMs()
	m.broadcastAction(r, "MEMBER_STATUS_CHANGED", map[string]any{"userId": userID, "status": p.Status})
}

// ─── Ban / unban / invite (Phase 4 — load-bearing entry gate kept real;
//     bookkeeping kept simple per the scope note) ──────────────────────────────

func (m *Manager) onBan(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		TargetUserID string `json:"targetUserId"`
		Reason       string `json:"reason"`
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
	if r.HostUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "Only the host can ban members.")
		return
	}
	if p.TargetUserID == userID {
		ent.mu.Unlock()
		return
	}
	for _, b := range r.BannedUsers {
		if b.UserID == p.TargetUserID {
			ent.mu.Unlock()
			sendErr(c, "INVALID_PAYLOAD", "User is already banned.")
			return
		}
	}
	uname := "Unknown"
	if t, ok := r.Members[p.TargetUserID]; ok {
		uname = t.UserName
	}
	r.BannedUsers = append(r.BannedUsers, &bannedUser{
		UserID: p.TargetUserID, UserName: uname, BannedAt: nowMs(),
		BannedBy: userID, Reason: p.Reason,
	})
	_, stillMember := r.Members[p.TargetUserID]
	r.LastActivity = nowMs()
	m.broadcastAction(r, "MEMBER_BANNED", map[string]any{
		"userId": p.TargetUserID, "userName": uname, "reason": nullable(p.Reason),
	})
	ent.mu.Unlock()

	if tc, ok := m.connOf(p.TargetUserID); ok {
		tc.Send(realtime.MustEnvelope(s2cRoomKicked, map[string]any{"reason": "banned"}))
		m.hub.Leave(tc, ent.r.ID)
	}
	if stillMember {
		m.removeMember(ent, p.TargetUserID, reasonKicked)
	}
	m.logger.Info("member_banned", "roomId", ent.r.ID, "targetUserId", p.TargetUserID)
}

func (m *Manager) onUnban(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		TargetUserID string `json:"targetUserId"`
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
		sendErr(c, "NOT_HOST", "Only the host can unban members.")
		return
	}
	idx := -1
	var uname string
	for i, b := range r.BannedUsers {
		if b.UserID == p.TargetUserID {
			idx, uname = i, b.UserName
			break
		}
	}
	if idx == -1 {
		sendErr(c, "INVALID_PAYLOAD", "User is not banned.")
		return
	}
	r.BannedUsers = append(r.BannedUsers[:idx], r.BannedUsers[idx+1:]...)
	r.LastActivity = nowMs()
	m.broadcastAction(r, "MEMBER_UNBANNED", map[string]any{"userId": p.TargetUserID, "userName": uname})
}

func (m *Manager) onCreateInvite(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		ExpiresIn string `json:"expiresIn"`
		MaxUses   int    `json:"maxUses"`
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
	if r.HostUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "Only the host can create invites.")
		return
	}
	if len(r.InviteLinks) >= maxInviteLinks {
		ent.mu.Unlock()
		sendErr(c, "INVALID_PAYLOAD", "Maximum of 10 active invites reached.")
		return
	}
	ttlMs := map[string]int64{
		"1h": 3600_000, "6h": 6 * 3600_000, "24h": 24 * 3600_000,
		"7d": 7 * 24 * 3600_000, "never": 0,
	}
	ttl, known := ttlMs[p.ExpiresIn]
	if !known {
		ttl = ttlMs["24h"]
	}
	now := nowMs()
	expiresAt := int64(0)
	if ttl != 0 {
		expiresAt = now + ttl
	}
	inv := &inviteLink{
		Code: nanoid(8), RoomID: r.ID, CreatedBy: userID,
		ExpiresAt: expiresAt, MaxUses: p.MaxUses,
	}
	r.InviteLinks = append(r.InviteLinks, inv)
	r.LastActivity = now
	ent.mu.Unlock()

	c.Send(realtime.MustEnvelope(s2cRoomInviteCreated, map[string]any{
		"code": inv.Code, "roomId": inv.RoomID, "createdBy": inv.CreatedBy,
		"expiresAt": inv.ExpiresAt, "maxUses": inv.MaxUses, "useCount": inv.UseCount,
	}))
}

// ─── Browse / history ────────────────────────────────────────────────────────

func (m *Manager) onBrowse(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Limit int `json:"limit"`
	}
	_ = e.Bind(&p)
	if p.Limit <= 0 {
		p.Limit = 50
	}

	m.mu.Lock()
	ents := make([]*roomEntry, 0, len(m.rooms))
	for _, en := range m.rooms {
		ents = append(ents, en)
	}
	m.mu.Unlock()

	rooms := []map[string]any{}
	for _, en := range ents {
		if len(rooms) >= p.Limit {
			break
		}
		en.mu.Lock()
		r := en.r
		if !r.Settings.IsPublic {
			en.mu.Unlock()
			continue
		}
		hostName := "Unknown"
		if h, ok := r.Members[r.HostUserID]; ok {
			hostName = h.UserName
		}
		var curVideo any
		if r.CurrentItem != nil {
			curVideo = r.CurrentItem.Title
		}
		rooms = append(rooms, map[string]any{
			"roomId": r.ID, "name": nullable(r.Name), "hostName": hostName,
			"memberCount": r.activeCount(), "maxMembers": r.Settings.MaxMembers,
			"currentVideo": curVideo, "hasPassword": r.Settings.Password != "",
			"scheduledFor": nil,
		})
		en.mu.Unlock()
	}
	c.Send(realtime.MustEnvelope(s2cRoomBrowseResult, map[string]any{"rooms": rooms}))
}

func (m *Manager) onCheckHistory(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		RoomIDs []string `json:"roomIds"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	results := make([]map[string]any, 0, len(p.RoomIDs))
	for _, rid := range p.RoomIDs {
		en, ok := m.entry(rid)
		if !ok {
			results = append(results, map[string]any{
				"roomId": rid, "isOpen": false, "memberCount": 0,
				"maxMembers": 0, "hostName": nil, "currentVideo": nil,
			})
			continue
		}
		en.mu.Lock()
		r := en.r
		hostName := "Unknown"
		if h, ok := r.Members[r.HostUserID]; ok {
			hostName = h.UserName
		}
		var curVideo any
		if r.CurrentItem != nil {
			curVideo = r.CurrentItem.Title
		}
		results = append(results, map[string]any{
			"roomId": rid, "isOpen": true, "memberCount": r.activeCount(),
			"maxMembers": r.Settings.MaxMembers, "hostName": hostName, "currentVideo": curVideo,
		})
		en.mu.Unlock()
	}
	c.Send(realtime.MustEnvelope(s2cRoomHistoryStatus, map[string]any{"rooms": results}))
}

// ─── Disband ─────────────────────────────────────────────────────────────────

func (m *Manager) disbandRoom(roomID, reason string) {
	ent, ok := m.entry(roomID)
	if !ok {
		return
	}

	// Hold the room lock across the whole teardown so a concurrent onRoomJoin
	// can't add a member to a room being deleted (the join's MEMBER_JOINED would
	// otherwise race the disband and leave a dangling userRoomIndex entry). The
	// broadcast, index cleanup, and registry delete all happen under ent.mu, and
	// the registry delete is what makes the room unreachable to future joins.
	ent.mu.Lock()
	m.broadcastEnvelope(roomID, s2cRoomDisbanded, map[string]any{})
	for uid := range ent.r.Members {
		m.grace.Cancel(graceKey(roomID, uid))
		m.mu.Lock()
		delete(m.userRoomIndex, uid)
		m.mu.Unlock()
	}
	m.mu.Lock()
	delete(m.rooms, roomID)
	m.mu.Unlock()
	ent.mu.Unlock()

	go m.persist("room_close", func() error { return m.repo.CloseRoom(m.ctx, roomID) })
	m.logger.Info("room_disbanded", "roomId", roomID, "reason", reason)
}

// ─── Garbage collector ───────────────────────────────────────────────────────

func (m *Manager) startGC() {
	m.gcTick = time.NewTicker(roomGCInterval)
	go func() {
		for {
			select {
			case <-m.stopCh:
				return
			case <-m.ctx.Done():
				return
			case <-m.gcTick.C:
				m.runGC()
			}
		}
	}()
}

func (m *Manager) runGC() {
	now := nowMs()
	m.mu.Lock()
	ids := make([]string, 0, len(m.rooms))
	ents := make([]*roomEntry, 0, len(m.rooms))
	for id, en := range m.rooms {
		ids = append(ids, id)
		ents = append(ents, en)
	}
	m.mu.Unlock()

	for i, en := range ents {
		en.mu.Lock()
		r := en.r
		active := r.activeCount()
		last := r.LastActivity
		en.mu.Unlock()
		if active == 0 && now-last > roomEmptyTimeout.Milliseconds() {
			m.disbandRoom(ids[i], "gc_empty")
			continue
		}
		if now-last > roomIdleTimeout.Milliseconds() {
			m.disbandRoom(ids[i], "gc_idle")
		}
	}
}

// ─── DB restore / load ───────────────────────────────────────────────────────

// RestoreRoomsFromDB hydrates all active rooms before the server starts
// listening (ports restoreRoomsFromDb). Members start disconnected.
func (m *Manager) RestoreRoomsFromDB() error {
	rooms, err := m.repo.RestoreActiveRooms(m.ctx)
	if err != nil {
		return err
	}
	restored := 0
	for i := range rooms {
		if m.hydrateRoom(&rooms[i]) {
			restored++
		}
	}
	if restored > 0 {
		m.logger.Info("rooms_restored_from_db", "count", restored)
	}
	return nil
}

// loadRoomFromDB loads a single room on a join miss (ports loadRoomFromDb).
func (m *Manager) loadRoomFromDB(roomID string) *roomEntry {
	rr, err := m.repo.LoadRoom(m.ctx, roomID)
	if err != nil {
		m.logger.Error("db_load_room_failed", "roomId", roomID, "error", err)
		return nil
	}
	if rr == nil {
		return nil
	}
	if !m.hydrateRoom(rr) {
		return nil
	}
	ent, _ := m.entry(roomID)
	m.logger.Info("room_loaded_from_db", "roomId", roomID)
	return ent
}

// hydrateRoom builds an in-memory room from a DB projection and installs it.
// Returns false (skips) for already-present or member-less rooms.
func (m *Manager) hydrateRoom(rr *restoredRoom) bool {
	if _, exists := m.entry(rr.ID); exists {
		return false
	}
	if len(rr.Members) == 0 {
		return false
	}
	now := nowMs()
	members := make(map[string]*member, len(rr.Members))
	for _, dm := range rr.Members {
		role := "member"
		if dm.UserID == rr.HostID {
			role = "host"
		}
		members[dm.UserID] = &member{
			UserID: dm.UserID, UserName: dm.UserName, AvatarURL: dm.Avatar,
			ConnID: "", IsConnected: false, JoinedAt: dm.JoinedAt, LastSeenAt: now,
			Role: role, Status: "watching",
		}
	}
	r := &room{
		ID: rr.ID, Name: rr.Name, HostUserID: rr.HostID, LeaderUserID: rr.HostID,
		Settings: roomSettings{
			IsPublic: rr.IsPublic, MaxMembers: rr.MaxMembers, AllowMemberQueue: rr.AllowQueue,
			AllowMemberSkip: rr.AllowSkip, AutoPlay: rr.AutoPlay, Password: rr.Password,
		},
		Members: members, Queue: rr.Queue, CurrentIndex: -1,
		VideoState: videoState{PlaybackRate: 1, UpdatedAt: now},
		Chat:       rr.Chat, SkipVotes: map[string]struct{}{},
		CreatedAt: rr.CreatedAt, LastActivity: rr.UpdatedAt,
		TypingTimers:  map[string]*time.Timer{},
		ChatReactions: map[string]map[string]map[string]struct{}{},
		QueueVotes:    map[string]map[string]struct{}{},
	}
	if r.Chat == nil {
		r.Chat = []*chatMessage{}
	}
	ent := &roomEntry{r: r}
	m.mu.Lock()
	m.rooms[rr.ID] = ent
	for uid := range members {
		m.userRoomIndex[uid] = rr.ID
	}
	m.mu.Unlock()
	return true
}

// ─── persist helper ──────────────────────────────────────────────────────────

// persist runs a DB write fire-and-forget, logging failures and counting the
// outcome (ports the .catch(...) pattern around every Prisma call).
func (m *Manager) persist(op string, fn func() error) {
	err := fn()
	outcome := "ok"
	if err != nil {
		outcome = "error"
		m.logger.Error("db_"+op+"_failed", "error", err)
	}
	if m.metrics != nil {
		m.metrics.DBQueries.WithLabelValues(outcome).Inc()
	}
}

// ─── room helpers (called under the room lock) ────────────────────────────────

func (r *room) activeCount() int {
	n := 0
	for _, mem := range r.Members {
		if mem.IsConnected {
			n++
		}
	}
	return n
}

// longestConnected returns the connected member with the earliest joinedAt, or
// any remaining member (ports getLongestConnectedMember).
func (r *room) longestConnected() *member {
	var oldest *member
	for _, mem := range r.Members {
		if !mem.IsConnected {
			continue
		}
		if oldest == nil || mem.JoinedAt < oldest.JoinedAt {
			oldest = mem
		}
	}
	if oldest != nil {
		return oldest
	}
	for _, mem := range r.Members {
		return mem
	}
	return nil
}

func graceKey(roomID, userID string) string { return roomID + "|" + userID }

// nullable maps "" to JSON null, otherwise the string (the TS `?? null` fields).
func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}
