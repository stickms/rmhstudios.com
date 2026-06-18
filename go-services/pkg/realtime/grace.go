package realtime

import (
	"sync"
	"time"
)

// GraceTimers manages keyed, cancellable delayed actions. It is the Go analog
// of the setTimeout-based "disconnect grace period" and "empty-room GC" timers
// scattered across the Node room managers (rmhtube 120s, rmhmusic 30s grace;
// per-room reap). Scheduling the same key again cancels the prior timer.
type GraceTimers struct {
	mu     sync.Mutex
	timers map[string]*time.Timer
}

// NewGraceTimers builds an empty timer registry.
func NewGraceTimers() *GraceTimers {
	return &GraceTimers{timers: make(map[string]*time.Timer)}
}

// Schedule (re)arms a timer for key that runs fn after d. Any existing timer for
// key is cancelled first, so the most recent call wins (e.g. a reconnect before
// the grace period elapses cancels the pending removal).
func (g *GraceTimers) Schedule(key string, d time.Duration, fn func()) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if t, ok := g.timers[key]; ok {
		t.Stop()
	}
	g.timers[key] = time.AfterFunc(d, func() {
		g.mu.Lock()
		delete(g.timers, key)
		g.mu.Unlock()
		fn()
	})
}

// Cancel stops and forgets the timer for key, if any. Returns true if a pending
// timer was cancelled (i.e. the action had not yet fired).
func (g *GraceTimers) Cancel(key string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if t, ok := g.timers[key]; ok {
		stopped := t.Stop()
		delete(g.timers, key)
		return stopped
	}
	return false
}

// CancelAll stops every pending timer (call on shutdown).
func (g *GraceTimers) CancelAll() {
	g.mu.Lock()
	defer g.mu.Unlock()
	for k, t := range g.timers {
		t.Stop()
		delete(g.timers, k)
	}
}
