package rmhtube

import (
	"math/rand"
	"sort"

	"github.com/rmhstudios/rmh-go/pkg/realtime"
)

// Faithful port of server/rmhtube/media-queue.ts.

func (m *Manager) onQueueAdd(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		URL   string `json:"url"`
		Title string `json:"title"`
	}
	if err := e.Bind(&p); err != nil || p.URL == "" {
		return
	}
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	r := ent.r
	if r.HostUserID != userID && !r.Settings.AllowMemberQueue {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "Only the host can add to the queue.")
		return
	}
	if len(r.Queue) >= maxQueueSize {
		ent.mu.Unlock()
		sendErr(c, "QUEUE_FULL", "Queue is full.")
		return
	}
	mediaType := detectMediaType(p.URL)
	if mediaType == "" {
		ent.mu.Unlock()
		sendErr(c, "INVALID_URL", "Unsupported media URL.")
		return
	}

	title := p.Title
	if title == "" {
		title = p.URL
	}
	thumb := ""
	if mediaType == "youtube" {
		if vid := extractYouTubeID(p.URL); vid != "" {
			thumb = youtubeThumbURL(vid)
			if p.Title == "" {
				title = "YouTube Video (" + vid + ")"
			}
		}
	}
	if len(title) > 256 {
		title = title[:256]
	}
	now := nowMs()
	item := &queueItem{
		ID: nanoid(12), URL: p.URL, MediaType: mediaType, Title: title,
		Thumbnail: thumb, AddedBy: userID, AddedByName: nameOf(c),
		AddedAt: now, Position: len(r.Queue),
	}
	r.Queue = append(r.Queue, item)
	r.LastActivity = now
	m.broadcastAction(r, "QUEUE_ITEM_ADDED", map[string]any{"item": baseQueueItem(item)})

	autoStart := r.CurrentItem == nil && r.Settings.AutoPlay
	if autoStart {
		m.playAtIndex(r, 0)
	}
	roomID := r.ID
	ent.mu.Unlock()

	go m.persist("queue_add", func() error { return m.repo.QueueAdd(m.ctx, roomID, item) })
	m.logger.Info("queue_item_added", "roomId", roomID, "userId", userID, "title", item.Title)
}

func (m *Manager) onQueueRemove(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		ItemID string `json:"itemId"`
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
	idx := indexOfItem(r.Queue, p.ItemID)
	if idx == -1 {
		ent.mu.Unlock()
		return
	}
	item := r.Queue[idx]
	if r.HostUserID != userID && item.AddedBy != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_HOST", "You can only remove your own items.")
		return
	}
	r.Queue = append(r.Queue[:idx], r.Queue[idx+1:]...)
	reindex(r.Queue)
	r.LastActivity = nowMs()
	m.broadcastAction(r, "QUEUE_ITEM_REMOVED", map[string]any{"itemId": p.ItemID})
	positions := snapshotQueue(r.Queue)
	itemID := p.ItemID
	ent.mu.Unlock()

	go m.persist("queue_remove", func() error {
		if err := m.repo.QueueRemove(m.ctx, itemID); err != nil {
			return err
		}
		return m.repo.QueuePositions(m.ctx, positions)
	})
}

func (m *Manager) onQueueReorder(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		ItemID      string `json:"itemId"`
		NewPosition int    `json:"newPosition"`
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
	if r.LeaderUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_LEADER", "Only the leader can reorder the queue.")
		return
	}
	if !moveItem(&r.Queue, p.ItemID, p.NewPosition) {
		ent.mu.Unlock()
		return
	}
	r.LastActivity = nowMs()
	m.broadcastAction(r, "QUEUE_REORDERED", map[string]any{"queue": serializeQueue(r.Queue)})
	positions := snapshotQueue(r.Queue)
	ent.mu.Unlock()

	go m.persist("queue_reorder", func() error { return m.repo.QueuePositions(m.ctx, positions) })
}

func (m *Manager) onQueuePlayItem(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		ItemID string `json:"itemId"`
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
	if r.LeaderUserID != userID {
		sendErr(c, "NOT_LEADER", "Only the leader can select a video.")
		return
	}
	idx := indexOfItem(r.Queue, p.ItemID)
	if idx == -1 {
		return
	}
	m.playAtIndex(r, idx)
}

func (m *Manager) onQueueSkip(c *realtime.Conn, _ realtime.Envelope) {
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	defer ent.mu.Unlock()
	r := ent.r
	if r.LeaderUserID != userID {
		sendErr(c, "NOT_LEADER", "Only the leader can skip.")
		return
	}
	m.advanceQueue(r)
}

func (m *Manager) onQueueVoteSkip(c *realtime.Conn, _ realtime.Envelope) {
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	defer ent.mu.Unlock()
	r := ent.r
	if !r.Settings.AllowMemberSkip {
		sendErr(c, "NOT_HOST", "Vote-to-skip is disabled.")
		return
	}
	if r.CurrentItem == nil {
		return
	}
	r.SkipVotes[userID] = struct{}{}
	active := r.activeCount()
	votesNeeded := (active + 1) / 2 // ceil(active/2)
	voters := setToSlice(r.SkipVotes)
	m.broadcastAction(r, "VOTE_SKIP_UPDATED", map[string]any{
		"voters": voters, "votesNeeded": votesNeeded, "totalMembers": active,
	})
	if len(r.SkipVotes) >= votesNeeded {
		m.broadcastAction(r, "VOTE_SKIP_PASSED", map[string]any{})
		m.advanceQueue(r)
	}
}

func (m *Manager) onQueueVote(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		ItemID string `json:"itemId"`
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
	if !r.Settings.QueueVoting {
		sendErr(c, "VOTING_DISABLED", "Queue voting is disabled.")
		return
	}
	if indexOfItem(r.Queue, p.ItemID) == -1 {
		sendErr(c, "ITEM_NOT_FOUND", "Queue item not found.")
		return
	}
	voters := r.QueueVotes[p.ItemID]
	if voters == nil {
		voters = map[string]struct{}{}
		r.QueueVotes[p.ItemID] = voters
	}
	if _, ok := voters[userID]; ok {
		delete(voters, userID)
	} else {
		voters[userID] = struct{}{}
	}
	r.LastActivity = nowMs()
	m.broadcastAction(r, "QUEUE_VOTE_UPDATED", map[string]any{
		"itemId": p.ItemID, "votes": len(voters), "voters": setToSlice(voters),
	})
	if r.Settings.AutoSortByVotes {
		m.sortQueueByVotes(r)
	}
}

func (m *Manager) onQueueShuffle(c *realtime.Conn, _ realtime.Envelope) {
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	ent.mu.Lock()
	r := ent.r
	if r.LeaderUserID != userID {
		ent.mu.Unlock()
		sendErr(c, "NOT_LEADER", "Only the leader can shuffle the queue.")
		return
	}
	start := r.CurrentIndex + 1
	if start >= len(r.Queue) {
		ent.mu.Unlock()
		return
	}
	// Fisher-Yates over the items after currentIndex.
	for i := len(r.Queue) - 1; i > start; i-- {
		j := start + rand.Intn(i-start+1)
		r.Queue[i], r.Queue[j] = r.Queue[j], r.Queue[i]
	}
	reindex(r.Queue)
	r.LastActivity = nowMs()
	m.broadcastAction(r, "QUEUE_REORDERED", map[string]any{"queue": serializeQueue(r.Queue)})
	positions := snapshotQueue(r.Queue)
	ent.mu.Unlock()

	go m.persist("queue_shuffle", func() error { return m.repo.QueuePositions(m.ctx, positions) })
}

func (m *Manager) onReaction(c *realtime.Conn, e realtime.Envelope) {
	var p struct {
		Emoji string `json:"emoji"`
	}
	if err := e.Bind(&p); err != nil {
		return
	}
	userID := userOf(c)
	ent, ok := m.entryForUser(userID)
	if !ok {
		return
	}
	roomID := ent.r.ID
	m.broadcastExcept(roomID, c.ID, s2cReactionBroadcast, map[string]any{
		"userId": userID, "userName": nameOf(c), "emoji": p.Emoji,
	})
}

// ─── internal queue mechanics (called under the room lock) ────────────────────

// advanceQueue ports advanceQueue: pushes the current item to history, then plays
// the next item / loops / ends playback.
func (m *Manager) advanceQueue(r *room) {
	r.SkipVotes = map[string]struct{}{}

	if r.CurrentItem != nil {
		cp := *r.CurrentItem
		r.PlayedItems = append(r.PlayedItems, &cp)
		if len(r.PlayedItems) > playedHistoryCap {
			r.PlayedItems = r.PlayedItems[len(r.PlayedItems)-playedHistoryCap:]
		}
		m.broadcastAction(r, "QUEUE_HISTORY_UPDATED", map[string]any{"playedItems": serializeQueue(r.PlayedItems)})
		playedID := r.CurrentItem.ID
		go m.persist("queue_played", func() error { return m.repo.QueuePlayed(m.ctx, playedID) })
	}

	next := r.CurrentIndex + 1
	switch {
	case next < len(r.Queue):
		m.playAtIndex(r, next)
	case r.Settings.LoopQueue && len(r.Queue) > 0:
		m.playAtIndex(r, 0)
		m.logger.Info("queue_looped", "roomId", r.ID)
	default:
		r.CurrentItem = nil
		r.CurrentIndex = -1
		m.onMediaChanged(r)
		m.broadcastAction(r, "PLAYBACK_ENDED", map[string]any{})
		m.logger.Info("queue_exhausted", "roomId", r.ID)
	}
}

// playAtIndex ports playAtIndex: set current, reset video state, broadcast.
func (m *Manager) playAtIndex(r *room, index int) {
	if index < 0 || index >= len(r.Queue) {
		return
	}
	r.CurrentItem = r.Queue[index]
	r.CurrentIndex = index
	r.LastActivity = nowMs()
	m.onMediaChanged(r)
	m.broadcastAction(r, "NOW_PLAYING", map[string]any{
		"item": baseQueueItem(r.CurrentItem), "index": r.CurrentIndex,
	})
	m.logger.Info("now_playing", "roomId", r.ID, "title", r.CurrentItem.Title, "index", index)
}

// sortQueueByVotes ports sortQueueByVotes: stable-sort the items after
// currentIndex by descending vote count, broadcast, persist.
func (m *Manager) sortQueueByVotes(r *room) {
	start := r.CurrentIndex + 1
	if start >= len(r.Queue) {
		return
	}
	tail := r.Queue[start:]
	sort.SliceStable(tail, func(i, j int) bool {
		return len(r.QueueVotes[tail[i].ID]) > len(r.QueueVotes[tail[j].ID])
	})
	reindex(r.Queue)
	m.broadcastAction(r, "QUEUE_REORDERED", map[string]any{"queue": serializeQueue(r.Queue)})
	positions := snapshotQueue(r.Queue)
	go m.persist("queue_vote_sort", func() error { return m.repo.QueuePositions(m.ctx, positions) })
}

// ─── small queue helpers ──────────────────────────────────────────────────────

func indexOfItem(q []*queueItem, id string) int {
	for i, it := range q {
		if it.ID == id {
			return i
		}
	}
	return -1
}

func reindex(q []*queueItem) {
	for i, it := range q {
		it.Position = i
	}
}

// moveItem ports the reorder splice from reorderQueue: pulls itemID out and
// re-inserts it at clamp(newPosition, 0, len-1), then reindexes positions.
// Returns false when the item is not present. Mutates *q in place.
func moveItem(q *[]*queueItem, itemID string, newPosition int) bool {
	queue := *q
	old := indexOfItem(queue, itemID)
	if old == -1 {
		return false
	}
	newPos := clamp(newPosition, 0, len(queue)-1)
	item := queue[old]
	queue = append(queue[:old], queue[old+1:]...)
	queue = append(queue[:newPos], append([]*queueItem{item}, queue[newPos:]...)...)
	reindex(queue)
	*q = queue
	return true
}

func serializeQueue(q []*queueItem) []map[string]any {
	out := make([]map[string]any, 0, len(q))
	for _, it := range q {
		out = append(out, baseQueueItem(it))
	}
	return out
}

// snapshotQueue copies the items (id+position) so the async persist sees a stable
// view even if the live queue mutates after the lock is released.
func snapshotQueue(q []*queueItem) []*queueItem {
	out := make([]*queueItem, len(q))
	for i, it := range q {
		cp := &queueItem{ID: it.ID, Position: it.Position}
		out[i] = cp
	}
	return out
}

func setToSlice(s map[string]struct{}) []string {
	out := make([]string, 0, len(s))
	for k := range s {
		out = append(out, k)
	}
	return out
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
