// Package ratelimit ports server/shared/rate-limit.ts: an in-memory
// sliding-window limiter keyed by (connection, event), bounded in size with
// periodic GC of stale entries. It is concurrency-safe (the Node version was
// single-threaded; Go needs a mutex because handlers run on many goroutines).
package ratelimit

import (
	"sync"
	"time"
)

// Rule defines a sliding window: at most Max events per Window.
type Rule struct {
	Max    int
	Window time.Duration
}

type bucket struct {
	hits     []int64 // unix-nano timestamps within the window
	lastSeen int64
}

// Limiter is a bounded, GC'd sliding-window rate limiter.
type Limiter struct {
	mu       sync.Mutex
	buckets  map[string]*bucket
	rules    map[string]Rule
	maxItems int
	ttl      time.Duration
	stop     chan struct{}
	stopOnce sync.Once
}

// New builds a limiter. maxItems caps memory (Node bounded at 50k); entries
// idle longer than ttl are evicted by a background sweeper.
func New(rules map[string]Rule, maxItems int, ttl time.Duration) *Limiter {
	l := &Limiter{
		buckets:  make(map[string]*bucket),
		rules:    rules,
		maxItems: maxItems,
		ttl:      ttl,
		stop:     make(chan struct{}),
	}
	go l.sweep()
	return l
}

// Allow reports whether an event from conn is permitted under its rule.
// Unknown events are always allowed (mirrors the Node default).
func (l *Limiter) Allow(conn, event string) bool {
	rule, ok := l.rules[event]
	if !ok {
		return true
	}
	now := time.Now().UnixNano()
	cutoff := now - rule.Window.Nanoseconds()
	key := conn + "|" + event

	l.mu.Lock()
	defer l.mu.Unlock()

	b := l.buckets[key]
	if b == nil {
		if len(l.buckets) >= l.maxItems {
			// Shed load rather than grow unbounded.
			return false
		}
		b = &bucket{}
		l.buckets[key] = b
	}
	// Drop timestamps outside the window.
	kept := b.hits[:0]
	for _, t := range b.hits {
		if t >= cutoff {
			kept = append(kept, t)
		}
	}
	b.hits = kept
	b.lastSeen = now
	if len(b.hits) >= rule.Max {
		return false
	}
	b.hits = append(b.hits, now)
	return true
}

// Forget drops all buckets for a connection (call on disconnect).
func (l *Limiter) Forget(conn string) {
	prefix := conn + "|"
	l.mu.Lock()
	defer l.mu.Unlock()
	for k := range l.buckets {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			delete(l.buckets, k)
		}
	}
}

// Close stops the background sweeper. Safe to call more than once.
func (l *Limiter) Close() { l.stopOnce.Do(func() { close(l.stop) }) }

func (l *Limiter) sweep() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-l.stop:
			return
		case <-t.C:
			cutoff := time.Now().UnixNano() - l.ttl.Nanoseconds()
			l.mu.Lock()
			for k, b := range l.buckets {
				if b.lastSeen < cutoff {
					delete(l.buckets, k)
				}
			}
			l.mu.Unlock()
		}
	}
}
