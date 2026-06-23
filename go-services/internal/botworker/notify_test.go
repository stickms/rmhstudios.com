package botworker

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestInternalAPIBasePrefersInternalURL(t *testing.T) {
	t.Setenv("INTERNAL_API_URL", "https://internal.example.com/")
	t.Setenv("BETTER_AUTH_URL", "https://auth.example.com")
	got := internalAPIBase()
	// Trailing slash is stripped, INTERNAL_API_URL wins.
	if got != "https://internal.example.com" {
		t.Fatalf("internalAPIBase = %q, want https://internal.example.com", got)
	}
}

func TestInternalAPIBaseFallsBackToAuthOrigin(t *testing.T) {
	t.Setenv("INTERNAL_API_URL", "")
	t.Setenv("BETTER_AUTH_URL", "https://auth.example.com/some/path")
	got := internalAPIBase()
	if got != "https://auth.example.com" {
		t.Fatalf("internalAPIBase = %q, want https://auth.example.com (origin only)", got)
	}
}

func TestInternalAPIBaseDefault(t *testing.T) {
	t.Setenv("INTERNAL_API_URL", "")
	t.Setenv("BETTER_AUTH_URL", "")
	got := internalAPIBase()
	if got != "http://127.0.0.1:7005" {
		t.Fatalf("internalAPIBase = %q, want http://127.0.0.1:7005 default", got)
	}
}

func TestNotifyMessageURLAndPayload(t *testing.T) {
	url := notifyMessageURL("https://internal.example.com")
	if url != "https://internal.example.com/api/internal/notify-message" {
		t.Fatalf("notifyMessageURL = %q", url)
	}

	payload := messagePayload{
		ID:             "m1",
		ConversationID: "c1",
		Content:        "hello there",
		SenderID:       "bot1",
		Read:           false,
		CreatedAt:      "2026-06-22T00:00:00Z",
	}
	body, err := buildNotifyMessageBody("human1", payload)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		UserID  string         `json:"userId"`
		Message map[string]any `json:"message"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.UserID != "human1" {
		t.Errorf("userId = %q, want human1", parsed.UserID)
	}
	if parsed.Message["conversationId"] != "c1" || parsed.Message["content"] != "hello there" {
		t.Errorf("message payload wrong: %v", parsed.Message)
	}
}

func TestNotifyTypingURLAndPayload(t *testing.T) {
	url := notifyTypingURL("https://internal.example.com")
	if url != "https://internal.example.com/api/internal/notify-typing" {
		t.Fatalf("notifyTypingURL = %q", url)
	}

	body, err := buildNotifyTypingBody("human1", typingPayload{
		ConversationID: "c1",
		SenderID:       "bot1",
		IsTyping:       true,
	})
	if err != nil {
		t.Fatal(err)
	}
	s := string(body)
	for _, want := range []string{`"userId":"human1"`, `"conversationId":"c1"`, `"isTyping":true`} {
		if !strings.Contains(s, want) {
			t.Errorf("typing body %q missing %q", s, want)
		}
	}
}
