// Package events is the cross-instance pub/sub backplane that makes the
// realtime services horizontally scalable — exactly the "socket.io Redis
// adapter + sticky sessions" work PR #121 flagged as Stage 1 and "the real
// first scaling investment". A single Bus interface has two implementations:
//
//   - Local: an in-process fan-out (single replica; zero external deps). This
//     is the default and reproduces today's single-process behavior.
//   - Redis: a Redis pub/sub bus (set REDIS_URL) so N replicas of a realtime
//     service share room broadcasts. Sticky sessions at the ingress keep a
//     given client pinned to one replica; the bus carries fan-out across them.
//
// Services publish/subscribe by topic (typically a room id). The realtime hub
// bridges local websocket fan-out with the Bus so a broadcast reaches clients
// on every replica.
package events

import (
	"context"
	"sync"

	"github.com/redis/go-redis/v9"
)

// Message is an opaque payload delivered on a topic.
type Message struct {
	Topic   string
	Payload []byte
	// Origin identifies the publishing replica so subscribers can skip
	// re-delivering to the local connections that already received it.
	Origin string
}

// Bus is the minimal pub/sub contract the realtime hub depends on.
type Bus interface {
	Publish(ctx context.Context, topic string, payload []byte) error
	// Subscribe returns a channel of messages for a topic and an unsubscribe
	// func. Closing via the returned func releases resources.
	Subscribe(ctx context.Context, topic string) (<-chan Message, func(), error)
	Close() error
}

// --- Local (in-process) bus ------------------------------------------------

// Local is a single-process Bus. Useful for one-replica deployments and tests.
type Local struct {
	origin string
	mu     sync.RWMutex
	subs   map[string]map[chan Message]struct{}
}

// NewLocal builds an in-process bus.
func NewLocal(origin string) *Local {
	return &Local{origin: origin, subs: make(map[string]map[chan Message]struct{})}
}

// Publish fans out to local subscribers.
func (l *Local) Publish(_ context.Context, topic string, payload []byte) error {
	l.mu.RLock()
	defer l.mu.RUnlock()
	for ch := range l.subs[topic] {
		select {
		case ch <- Message{Topic: topic, Payload: payload, Origin: l.origin}:
		default: // drop for slow consumers; realtime favors freshness
		}
	}
	return nil
}

// Subscribe registers a local subscriber.
func (l *Local) Subscribe(_ context.Context, topic string) (<-chan Message, func(), error) {
	ch := make(chan Message, 64)
	l.mu.Lock()
	if l.subs[topic] == nil {
		l.subs[topic] = make(map[chan Message]struct{})
	}
	l.subs[topic][ch] = struct{}{}
	l.mu.Unlock()

	cancel := func() {
		l.mu.Lock()
		if m := l.subs[topic]; m != nil {
			delete(m, ch)
			if len(m) == 0 {
				delete(l.subs, topic)
			}
		}
		l.mu.Unlock()
		close(ch)
	}
	return ch, cancel, nil
}

// Close is a no-op for the local bus.
func (l *Local) Close() error { return nil }

// --- Redis bus -------------------------------------------------------------

// Redis is a Redis-backed Bus for multi-replica realtime fan-out.
type Redis struct {
	origin string
	client *redis.Client
}

// NewRedis dials Redis from a redis:// URL.
func NewRedis(origin, url string) (*Redis, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	return &Redis{origin: origin, client: redis.NewClient(opt)}, nil
}

// Publish sends a payload to a Redis channel named after the topic.
func (r *Redis) Publish(ctx context.Context, topic string, payload []byte) error {
	return r.client.Publish(ctx, topic, payload).Err()
}

// Subscribe consumes a Redis channel and adapts it to the Bus contract.
func (r *Redis) Subscribe(ctx context.Context, topic string) (<-chan Message, func(), error) {
	sub := r.client.Subscribe(ctx, topic)
	out := make(chan Message, 64)
	go func() {
		defer close(out)
		ch := sub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case m, ok := <-ch:
				if !ok {
					return
				}
				out <- Message{Topic: m.Channel, Payload: []byte(m.Payload), Origin: r.origin}
			}
		}
	}()
	cancel := func() { _ = sub.Close() }
	return out, cancel, nil
}

// Close releases the Redis client.
func (r *Redis) Close() error { return r.client.Close() }

// FromURL returns a Redis bus when url is non-empty, otherwise a Local bus.
// This is the one decision point that flips the fleet between single-replica
// and horizontally-scaled realtime.
func FromURL(origin, url string) (Bus, error) {
	if url == "" {
		return NewLocal(origin), nil
	}
	return NewRedis(origin, url)
}
