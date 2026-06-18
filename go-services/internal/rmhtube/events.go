package rmhtube

// Event name constants — ported 1:1 from lib/rmhtube/events.ts (C2S / S2C maps).
// The realtime hub speaks a JSON envelope whose Event field carries these exact
// strings, so the existing TypeScript client adapter maps cleanly onto it.

// Client → Server events.
const (
	// Room lifecycle
	c2sRoomCreate         = "rmhtube:room:create"
	c2sRoomJoin           = "rmhtube:room:join"
	c2sRoomLeave          = "rmhtube:room:leave"
	c2sRoomKick           = "rmhtube:room:kick"
	c2sRoomTransferHost   = "rmhtube:room:transfer_host"
	c2sRoomUpdateSettings = "rmhtube:room:update_settings"
	c2sRoomBrowse         = "rmhtube:room:browse"
	c2sRoomChat           = "rmhtube:room:chat"

	// Video sync (host → server)
	c2sSyncHostState = "rmhtube:sync:host_state"
	c2sSyncPlay      = "rmhtube:sync:play"
	c2sSyncPause     = "rmhtube:sync:pause"
	c2sSyncSeek      = "rmhtube:sync:seek"

	// Media queue
	c2sQueueAdd      = "rmhtube:queue:add"
	c2sQueueRemove   = "rmhtube:queue:remove"
	c2sQueueReorder  = "rmhtube:queue:reorder"
	c2sQueuePlayItem = "rmhtube:queue:play_item"
	c2sQueueSkip     = "rmhtube:queue:skip"
	c2sQueueVoteSkip = "rmhtube:queue:vote_skip"

	// Reactions
	c2sReactionSend = "rmhtube:reaction:send"

	// Phase 1: Chat features
	c2sChatTyping = "rmhtube:chat:typing"
	c2sChatReact  = "rmhtube:chat:react"
	c2sChatPin    = "rmhtube:chat:pin"

	// Phase 2: Synced playback speed
	c2sSyncSetSpeed = "rmhtube:sync:set_speed"

	// Phase 3: Queue features
	c2sQueueVote    = "rmhtube:queue:vote"
	c2sQueueShuffle = "rmhtube:queue:shuffle"

	// Phase 4: Room & social features
	c2sRoomSetLeader    = "rmhtube:room:set_leader"
	c2sRoomBan          = "rmhtube:room:ban"
	c2sRoomUnban        = "rmhtube:room:unban"
	c2sRoomCreateInvite = "rmhtube:room:create_invite"
	c2sRoomSetStatus    = "rmhtube:room:set_status"
	c2sRoomCheckHistory = "rmhtube:room:check_history"
)

// Server → Client events.
const (
	// Room state
	s2cRoomCreated       = "rmhtube:room:created"
	s2cRoomStateSnapshot = "rmhtube:room:state_snapshot"
	s2cRoomAction        = "rmhtube:room:action"
	s2cRoomBrowseResult  = "rmhtube:room:browse_result"
	s2cRoomKicked        = "rmhtube:room:kicked"
	s2cRoomDisbanded     = "rmhtube:room:disbanded"
	s2cNotInRoom         = "rmhtube:room:not_in_room"

	// Video sync (server → clients)
	s2cSyncState        = "rmhtube:sync:state"
	s2cSyncPlay         = "rmhtube:sync:play"
	s2cSyncPause        = "rmhtube:sync:pause"
	s2cSyncSeek         = "rmhtube:sync:seek"
	s2cSyncMediaChanged = "rmhtube:sync:media_changed"

	// Queue updates
	s2cQueueUpdated = "rmhtube:queue:updated"

	// Reactions
	s2cReactionBroadcast = "rmhtube:reaction:broadcast"

	// Errors
	s2cError = "rmhtube:error"

	// Phase 1: Typing indicators
	s2cChatTypingIndicator = "rmhtube:chat:typing_indicator"

	// Phase 2: Synced playback speed
	s2cSyncSpeedChanged = "rmhtube:sync:speed_changed"

	// Phase 4: Invite links
	s2cRoomInviteCreated = "rmhtube:room:invite_created"
	s2cRoomHistoryStatus = "rmhtube:room:history_status"
)
