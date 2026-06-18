package rmhmusic

// Event names ported verbatim from lib/rmhmusic/events.ts. They carry the
// "rmhmusic:" prefix because in Node this service lived inside the unified
// socket-server and namespaced its events; here it is its own service but the
// client adapter still speaks these exact names, so they must match byte-for-byte.
const (
	// C2S — client -> server.
	c2sRoomCreate       = "rmhmusic:room:create"
	c2sRoomJoin         = "rmhmusic:room:join"
	c2sRoomLeave        = "rmhmusic:room:leave"
	c2sRoomBrowse       = "rmhmusic:room:browse"
	c2sRoomChat         = "rmhmusic:room:chat"
	c2sRoomTransferHost = "rmhmusic:room:transfer_host"

	c2sMusicPlay  = "rmhmusic:music:play"
	c2sMusicPause = "rmhmusic:music:pause"
	c2sMusicSeek  = "rmhmusic:music:seek"
	c2sMusicSkip  = "rmhmusic:music:skip"

	c2sQueueAdd     = "rmhmusic:queue:add"
	c2sQueueRemove  = "rmhmusic:queue:remove"
	c2sQueueReorder = "rmhmusic:queue:reorder"

	// S2C — server -> client.
	s2cRoomCreated       = "rmhmusic:room:created"
	s2cRoomStateSnapshot = "rmhmusic:room:state_snapshot"
	s2cRoomAction        = "rmhmusic:room:action"
	s2cRoomBrowseResult  = "rmhmusic:room:browse_result"
	s2cRoomDisbanded     = "rmhmusic:room:disbanded"
	s2cNotInRoom         = "rmhmusic:room:not_in_room"

	s2cMusicPlay         = "rmhmusic:music:play"
	s2cMusicPause        = "rmhmusic:music:pause"
	s2cMusicSeek         = "rmhmusic:music:seek"
	s2cMusicTrackChanged = "rmhmusic:music:track_changed"
	s2cSyncHeartbeat     = "rmhmusic:sync:heartbeat"

	s2cQueueUpdated = "rmhmusic:queue:updated"

	s2cError = "rmhmusic:error"
)

// room:action delta types (the seq-numbered mutation broadcasts).
const (
	actionMemberJoined       = "MEMBER_JOINED"
	actionMemberLeft         = "MEMBER_LEFT"
	actionMemberDisconnected = "MEMBER_DISCONNECTED"
	actionHostTransferred    = "HOST_TRANSFERRED"
	actionChatMessage        = "CHAT_MESSAGE"
	actionNowPlaying         = "NOW_PLAYING"
	actionQueueItemAdded     = "QUEUE_ITEM_ADDED"
)

// Tunables ported from lib/rmhmusic/constants.ts and server/rmhmusic/config.ts.
const (
	roomCodeLength     = 6
	roomCodeAlphabet   = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	defaultMaxMembers  = 10
	maxQueueSize       = 50
	chatMaxLength      = 300
	chatHistoryLength  = 100
	nameMaxLength      = 64
	passwordMaxLength  = 64
	browseDefaultLimit = 20
	browseMaxLimit     = 50
)
