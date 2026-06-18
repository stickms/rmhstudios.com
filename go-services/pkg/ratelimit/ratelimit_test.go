package ratelimit

import (
	"testing"
	"time"
)

func TestSlidingWindow(t *testing.T) {
	l := New(map[string]Rule{"msg": {Max: 3, Window: time.Second}}, 100, time.Minute)
	defer l.Close()

	for i := 0; i < 3; i++ {
		if !l.Allow("conn1", "msg") {
			t.Fatalf("event %d should be allowed", i)
		}
	}
	if l.Allow("conn1", "msg") {
		t.Fatal("4th event in window should be blocked")
	}
	// A different connection has its own budget.
	if !l.Allow("conn2", "msg") {
		t.Fatal("other connection should be allowed")
	}
	// Unknown events are always allowed.
	if !l.Allow("conn1", "unknown") {
		t.Fatal("unknown event should be allowed")
	}
}

func TestWindowExpiry(t *testing.T) {
	l := New(map[string]Rule{"e": {Max: 1, Window: 50 * time.Millisecond}}, 100, time.Minute)
	defer l.Close()
	if !l.Allow("c", "e") {
		t.Fatal("first allowed")
	}
	if l.Allow("c", "e") {
		t.Fatal("second blocked")
	}
	time.Sleep(60 * time.Millisecond)
	if !l.Allow("c", "e") {
		t.Fatal("allowed again after window")
	}
}

func TestForget(t *testing.T) {
	l := New(map[string]Rule{"e": {Max: 1, Window: time.Minute}}, 100, time.Minute)
	defer l.Close()
	l.Allow("c", "e")
	if l.Allow("c", "e") {
		t.Fatal("blocked before forget")
	}
	l.Forget("c")
	if !l.Allow("c", "e") {
		t.Fatal("allowed after forget")
	}
}
