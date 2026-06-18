package rmhmusic

import (
	"context"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Playback sync — ports server/rmhmusic/sync-engine.ts. All four handlers are
// HOST-ONLY: a non-host control is rejected (play) or silently ignored
// (pause/seek/skip), exactly as in the Node SyncEngine.

type playPayload struct {
	TrackURI   string    `json:"trackUri"`
	PositionMs int64     `json:"positionMs"`
	Track      TrackInfo `json:"track"`
}

func (m *Manager) onPlay(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil || !m.isHost(room, c.UserID()) {
		m.sendErr(c, "NOT_HOST", "Only the host can control playback")
		return
	}
	var p playPayload
	if err := e.Bind(&p); err != nil || p.TrackURI == "" || p.PositionMs < 0 {
		m.sendErr(c, "INVALID_PAYLOAD", "Bad play payload")
		return
	}

	// Mutate playback and stamp the now-playing action under ONE critical section
	// so a concurrent host control can't interleave between the state change and
	// the broadcast (which would yield out-of-order track changes). broadcastAction
	// requires room.mu held; the plain s2cMusicPlay fan-out is emitted after the
	// single unlock (matches onPause/onSeek/onSkip).
	room.mu.Lock()
	track := p.Track
	room.CurrentTrack = &track
	room.Playback = Playback{
		TrackURI:   p.TrackURI,
		PositionMs: p.PositionMs,
		IsPlaying:  true,
		UpdatedAt:  m.now(),
	}
	m.broadcastAction(room, actionNowPlaying, map[string]any{"track": track})
	room.mu.Unlock()

	m.broadcast(room.ID, s2cMusicPlay, map[string]any{
		"trackUri": p.TrackURI, "positionMs": p.PositionMs, "track": track,
	})
}

type posPayload struct {
	PositionMs int64 `json:"positionMs"`
}

func (m *Manager) onPause(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil || !m.isHost(room, c.UserID()) {
		return
	}
	var p posPayload
	if err := e.Bind(&p); err != nil || p.PositionMs < 0 {
		return
	}
	room.mu.Lock()
	room.Playback.IsPlaying = false
	room.Playback.PositionMs = p.PositionMs
	room.Playback.UpdatedAt = m.now()
	room.mu.Unlock()

	m.broadcast(room.ID, s2cMusicPause, map[string]any{"positionMs": p.PositionMs})
}

func (m *Manager) onSeek(c *realtime.Conn, e realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil || !m.isHost(room, c.UserID()) {
		return
	}
	var p posPayload
	if err := e.Bind(&p); err != nil || p.PositionMs < 0 {
		return
	}
	room.mu.Lock()
	room.Playback.PositionMs = p.PositionMs
	room.Playback.UpdatedAt = m.now()
	room.mu.Unlock()

	m.broadcast(room.ID, s2cMusicSeek, map[string]any{"positionMs": p.PositionMs})
}

// onSkip ports SyncEngine.onSkip: advance to the next queued track (or clear
// playback when the queue is empty), reindex positions, broadcast play +
// queue:updated.
func (m *Manager) onSkip(c *realtime.Conn, _ realtime.Envelope) {
	room := m.roomForConn(c.ID)
	if room == nil || !m.isHost(room, c.UserID()) {
		return
	}

	room.mu.Lock()
	if len(room.Queue) == 0 {
		room.CurrentTrack = nil
		room.Playback = Playback{UpdatedAt: m.now()}
		room.mu.Unlock()
		m.broadcast(room.ID, s2cMusicTrackChanged, map[string]any{"track": nil})
		return
	}

	next := room.Queue[0]
	room.Queue = room.Queue[1:]
	reindex(room.Queue)
	track := TrackInfo{
		SpotifyURI: next.SpotifyURI,
		Title:      next.Title,
		Artist:     next.Artist,
		AlbumArt:   next.AlbumArt,
		DurationMs: next.DurationMs,
		PreviewURL: next.PreviewURL,
	}
	room.CurrentTrack = &track
	room.Playback = Playback{
		TrackURI:   next.SpotifyURI,
		PositionMs: 0,
		IsPlaying:  true,
		UpdatedAt:  m.now(),
	}
	queueSnapshot := room.Queue
	room.mu.Unlock()

	m.broadcast(room.ID, s2cMusicPlay, map[string]any{"trackUri": next.SpotifyURI, "positionMs": 0, "track": track})
	m.broadcast(room.ID, s2cQueueUpdated, map[string]any{"queue": queueSnapshot})
}

func (m *Manager) isHost(room *ServerRoom, userID string) bool {
	room.mu.Lock()
	defer room.mu.Unlock()
	return room.HostUserID == userID
}

// runHeartbeat ports SyncEngine.startHeartbeat: every 5s emit sync:heartbeat to
// each PLAYING room with the drift-corrected position
// (positionMs + elapsed-since-updatedAt).
func (m *Manager) runHeartbeat(ctx context.Context) {
	t := time.NewTicker(syncHeartbeat)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-m.stopCh:
			return
		case <-t.C:
			now := m.now()
			m.mu.RLock()
			rooms := make([]*ServerRoom, 0, len(m.rooms))
			for _, r := range m.rooms {
				rooms = append(rooms, r)
			}
			m.mu.RUnlock()
			for _, room := range rooms {
				room.mu.Lock()
				pb := room.Playback
				room.mu.Unlock()
				if !pb.IsPlaying {
					continue
				}
				m.broadcast(room.ID, s2cSyncHeartbeat, map[string]any{
					"trackUri":   pb.TrackURI,
					"positionMs": projectedPositionMs(pb, now),
					"isPlaying":  pb.IsPlaying,
				})
			}
		}
	}
}

func reindex(q []*ServerQueueItem) {
	for i, item := range q {
		item.Position = i
	}
}
