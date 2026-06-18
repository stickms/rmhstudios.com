package rmhtube

// Serialization helpers that mirror room-manager.ts buildClientState and the
// client-facing payload shapes. All are called with the room lock held.

// settingsPayload mirrors the RoomSettings shape sent to clients.
func settingsPayload(s roomSettings) map[string]any {
	cr := any(nil)
	if s.CustomReactions != nil {
		cr = s.CustomReactions
	}
	return map[string]any{
		"isPublic":         s.IsPublic,
		"maxMembers":       s.MaxMembers,
		"allowMemberQueue": s.AllowMemberQueue,
		"allowMemberSkip":  s.AllowMemberSkip,
		"autoPlay":         s.AutoPlay,
		"password":         nullable(s.Password),
		"queueVoting":      s.QueueVoting,
		"autoSortByVotes":  s.AutoSortByVotes,
		"loopQueue":        s.LoopQueue,
		"customReactions":  cr,
	}
}

// videoStatePayload mirrors the VideoState shape.
func videoStatePayload(v videoState) map[string]any {
	return map[string]any{
		"playing":      v.Playing,
		"currentTime":  v.CurrentTime,
		"playbackRate": v.PlaybackRate,
		"updatedAt":    v.UpdatedAt,
	}
}

// baseQueueItem mirrors the plain QueueItem fields (no vote annotations) — used
// for QUEUE_REORDERED / NOW_PLAYING / history payloads.
func baseQueueItem(q *queueItem) map[string]any {
	return map[string]any{
		"id":           q.ID,
		"url":          q.URL,
		"mediaType":    q.MediaType,
		"title":        q.Title,
		"duration":     nullableInt(q.Duration),
		"thumbnailUrl": nullable(q.Thumbnail),
		"addedBy":      q.AddedBy,
		"addedByName":  q.AddedByName,
		"addedAt":      q.AddedAt,
		"position":     q.Position,
	}
}

// clientQueueItem mirrors ClientQueueItem (base + vote annotations for forUserID).
func clientQueueItem(r *room, q *queueItem, forUserID string) map[string]any {
	item := baseQueueItem(q)
	voters := r.QueueVotes[q.ID]
	item["votes"] = len(voters)
	_, voted := voters[forUserID]
	item["votedByMe"] = voted
	return item
}

// buildClientState ports buildClientState: the full room snapshot for one user.
func (m *Manager) buildClientState(r *room, forUserID string) map[string]any {
	members := make([]map[string]any, 0, len(r.Members))
	for _, mem := range r.Members {
		members = append(members, map[string]any{
			"userId":      mem.UserID,
			"userName":    mem.UserName,
			"avatarUrl":   nullable(mem.AvatarURL),
			"isConnected": mem.IsConnected,
			"isHost":      mem.UserID == r.HostUserID,
			"isLeader":    mem.UserID == r.LeaderUserID,
			"role":        mem.Role,
			"status":      mem.Status,
		})
	}

	queue := make([]map[string]any, 0, len(r.Queue))
	for _, q := range r.Queue {
		queue = append(queue, clientQueueItem(r, q, forUserID))
	}

	var currentItem any
	if r.CurrentItem != nil {
		currentItem = clientQueueItem(r, r.CurrentItem, forUserID)
	}

	// Chat: last 200 messages, each with serialized reactions.
	chat := r.Chat
	if len(chat) > 200 {
		chat = chat[len(chat)-200:]
	}
	chatOut := make([]map[string]any, 0, len(chat))
	for _, msg := range chat {
		chatOut = append(chatOut, chatPayload(r, msg))
	}

	skipVotes := make([]string, 0, len(r.SkipVotes))
	for uid := range r.SkipVotes {
		skipVotes = append(skipVotes, uid)
	}

	var pinned any
	if r.PinnedMessage != nil {
		pinned = chatPayload(r, r.PinnedMessage)
	}

	played := r.PlayedItems
	if len(played) > 50 {
		played = played[len(played)-50:]
	}
	playedOut := make([]map[string]any, 0, len(played))
	for _, q := range played {
		playedOut = append(playedOut, clientQueueItem(r, q, forUserID))
	}

	// Ban list only exposed to the host.
	banned := []map[string]any{}
	if r.HostUserID == forUserID {
		for _, b := range r.BannedUsers {
			banned = append(banned, map[string]any{
				"userId": b.UserID, "userName": b.UserName, "bannedAt": b.BannedAt,
				"bannedBy": b.BannedBy, "reason": nullable(b.Reason),
			})
		}
	}

	return map[string]any{
		"roomId":        r.ID,
		"name":          nullable(r.Name),
		"hostUserId":    r.HostUserID,
		"leaderUserId":  r.LeaderUserID,
		"settings":      settingsPayload(r.Settings),
		"members":       members,
		"queue":         queue,
		"currentItem":   currentItem,
		"currentIndex":  r.CurrentIndex,
		"videoState":    videoStatePayload(r.VideoState),
		"chat":          chatOut,
		"skipVotes":     skipVotes,
		"myUserId":      forUserID,
		"seq":           r.Seq,
		"typingUsers":   []string{},
		"pinnedMessage": pinned,
		"playedItems":   playedOut,
		"bannedUsers":   banned,
	}
}

// chatPayload serializes a chat message with its reactions (msgID -> emoji -> users).
func chatPayload(r *room, msg *chatMessage) map[string]any {
	reactions := map[string][]string{}
	for emoji, users := range r.ChatReactions[msg.ID] {
		list := make([]string, 0, len(users))
		for uid := range users {
			list = append(list, uid)
		}
		reactions[emoji] = list
	}
	var ts any
	if msg.Timestamp != nil {
		ts = *msg.Timestamp
	}
	mentions := msg.Mentions
	if mentions == nil {
		mentions = []string{}
	}
	return map[string]any{
		"id":              msg.ID,
		"userId":          msg.UserID,
		"userName":        msg.UserName,
		"content":         msg.Content,
		"createdAt":       msg.CreatedAt,
		"replyToId":       nullable(msg.ReplyToID),
		"replyToContent":  nullable(msg.ReplyToContent),
		"replyToUserName": nullable(msg.ReplyToUserName),
		"mentions":        mentions,
		"timestamp":       ts,
		"reactions":       reactions,
	}
}

func nullableInt(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}
