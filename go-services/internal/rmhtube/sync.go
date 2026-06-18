package rmhtube

import (
	"time"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Faithful port of server/rmhtube/sync-engine.ts. The leader's player state is
// authoritative: the server stores the canonical VideoState (reported ~1s by the
// leader via SYNC_HOST_STATE) and broadcasts it on a 2s heartbeat to multi-member
// rooms. Explicit leader actions (play/pause/seek/speed) broadcast immediately.

// projectedState computes the live VideoState at time `nowMs`: when playing, the
// current position is the stored position plus the wall-clock elapsed since
// updatedAt, scaled by playbackRate. This is the leader-authoritative projection
// — clients seeing a heartbeat get the position the leader is *actually* at, not
// the position from one report ago. (Paused state is returned unchanged.)
func projectedState(v videoState, now int64) videoState {
	out := v
	if v.Playing {
		elapsed := float64(now-v.UpdatedAt) / 1000.0
		if elapsed < 0 {
			elapsed = 0
		}
		out.CurrentTime = v.CurrentTime + elapsed*v.PlaybackRate
		out.UpdatedAt = now
	}
	return out
}

// leaderRoom returns the user's room iff the user is the current leader.
func (m *Manager) leaderRoom(userID string) (*roomEntry, *room, bool) {
	ent, ok := m.entryForUser(userID)
	if !ok {
		return nil, nil, false
	}
	ent.mu.Lock()
	if ent.r.LeaderUserID != userID {
		ent.mu.Unlock()
		return nil, nil, false
	}
	return ent, ent.r, true
}

// onHostState ports onHostState: store the leader's reported state (no broadcast).
func (m *Manager) onHostState(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Playing      bool    `json:"playing"`
		CurrentTime  float64 `json:"currentTime"`
		PlaybackRate float64 `json:"playbackRate"`
		Timestamp    int64   `json:"timestamp"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	ent, r, ok := m.leaderRoom(userOf(c))
	if !ok {
		return
	}
	r.VideoState = videoState{
		Playing: p.Playing, CurrentTime: p.CurrentTime,
		PlaybackRate: p.PlaybackRate, UpdatedAt: nowMs(),
	}
	ent.mu.Unlock()
}

func (m *Manager) onPlay(c *realtime.Conn, _ realtime.Envelope) {
	ent, r, ok := m.leaderRoom(userOf(c))
	if !ok {
		return
	}
	r.VideoState.Playing = true
	r.VideoState.UpdatedAt = nowMs()
	r.LastActivity = nowMs()
	roomID := r.ID
	ent.mu.Unlock()
	m.broadcastExcept(roomID, c.ID, s2cSyncPlay, map[string]any{})
}

func (m *Manager) onPause(c *realtime.Conn, _ realtime.Envelope) {
	ent, r, ok := m.leaderRoom(userOf(c))
	if !ok {
		return
	}
	r.VideoState.Playing = false
	r.VideoState.UpdatedAt = nowMs()
	r.LastActivity = nowMs()
	roomID := r.ID
	ent.mu.Unlock()
	m.broadcastExcept(roomID, c.ID, s2cSyncPause, map[string]any{})
}

func (m *Manager) onSeek(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Time float64 `json:"time"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	ent, r, ok := m.leaderRoom(userOf(c))
	if !ok {
		return
	}
	r.VideoState.CurrentTime = p.Time
	r.VideoState.UpdatedAt = nowMs()
	r.LastActivity = nowMs()
	roomID := r.ID
	ent.mu.Unlock()
	m.broadcastExcept(roomID, c.ID, s2cSyncSeek, map[string]any{"time": p.Time})
}

func (m *Manager) onSetSpeed(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Speed float64 `json:"speed"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	ent, r, ok := m.leaderRoom(userOf(c))
	if !ok {
		return
	}
	r.VideoState.PlaybackRate = p.Speed
	r.VideoState.UpdatedAt = nowMs()
	r.LastActivity = nowMs()
	roomID := r.ID
	ent.mu.Unlock()
	// SYNC_SPEED_CHANGED goes to the whole room (the TS uses io.to, not socket.to).
	m.broadcastEnvelope(roomID, s2cSyncSpeedChanged, map[string]any{"speed": p.Speed})
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────

func (m *Manager) startSyncHeartbeat() {
	m.syncHB = time.NewTicker(syncHeartbeatInterval)
	go func() {
		for {
			select {
			case <-m.stopCh:
				return
			case <-m.ctx.Done():
				return
			case <-m.syncHB.C:
				m.tickHeartbeat()
			}
		}
	}()
	m.logger.Info("sync_heartbeat_started", "intervalMs", syncHeartbeatInterval.Milliseconds())
}

// tickHeartbeat broadcasts the projected video state to every multi-member room
// that has something playing (ports startHeartbeat's loop).
func (m *Manager) tickHeartbeat() {
	now := nowMs()
	m.mu.Lock()
	ents := make([]*roomEntry, 0, len(m.rooms))
	for _, en := range m.rooms {
		ents = append(ents, en)
	}
	m.mu.Unlock()

	for _, en := range ents {
		en.mu.Lock()
		r := en.r
		if r.CurrentItem == nil || len(r.Members) <= 1 {
			en.mu.Unlock()
			continue
		}
		state := projectedState(r.VideoState, now)
		roomID := r.ID
		en.mu.Unlock()
		m.broadcastEnvelope(roomID, s2cSyncState, videoStatePayload(state))
	}
}

// onMediaChanged ports onMediaChanged: reset video state, notify clients. Called
// by the queue under the room lock.
func (m *Manager) onMediaChanged(r *room) {
	r.VideoState = videoState{PlaybackRate: 1, UpdatedAt: nowMs()}
	var cur any
	if r.CurrentItem != nil {
		cur = baseQueueItem(r.CurrentItem)
	}
	m.broadcastEnvelope(r.ID, s2cSyncMediaChanged, map[string]any{
		"currentItem":  cur,
		"currentIndex": r.CurrentIndex,
	})
}
