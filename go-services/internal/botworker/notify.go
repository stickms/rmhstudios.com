package botworker

// notify.go — the SSE notify bridge, ported from server/bot-worker/index.ts
// (internalApiBase, notifyMessageDelivered, notifyTyping).
//
// Best-effort: the message is already persisted before we notify, so a missing
// secret or a failed HTTP call is logged and swallowed — never an error. The
// base URL resolves from INTERNAL_API_URL, else the origin of BETTER_AUTH_URL,
// else a localhost default — exactly mirroring the Node logic.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
)

// messagePayload mirrors the Node MessagePayload pushed to the SSE bridge.
type messagePayload struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversationId"`
	Content        string `json:"content"`
	SenderID       string `json:"senderId"`
	Read           bool   `json:"read"`
	CreatedAt      string `json:"createdAt"` // RFC3339, mirrors toISOString()
}

// typingPayload mirrors the ephemeral typing-indicator event.
type typingPayload struct {
	ConversationID string `json:"conversationId"`
	SenderID       string `json:"senderId"`
	IsTyping       bool   `json:"isTyping"`
}

// notifier pushes live SSE events into the web process via the internal API.
type notifier struct {
	http   *http.Client
	logger *log.Logger
}

func newNotifier(logger *log.Logger) *notifier {
	return &notifier{
		http:   &http.Client{Timeout: 5 * time.Second},
		logger: logger,
	}
}

// internalAPIBase resolves the web origin the worker calls for the SSE bridge.
// Mirrors Node internalApiBase().
func internalAPIBase() string {
	if v := os.Getenv("INTERNAL_API_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	if auth := os.Getenv("BETTER_AUTH_URL"); auth != "" {
		if u, err := url.Parse(auth); err == nil && u.Scheme != "" && u.Host != "" {
			return u.Scheme + "://" + u.Host
		}
	}
	return "http://127.0.0.1:7005"
}

func notifyMessageURL(base string) string { return base + "/api/internal/notify-message" }
func notifyTypingURL(base string) string  { return base + "/api/internal/notify-typing" }

func buildNotifyMessageBody(userID string, msg messagePayload) ([]byte, error) {
	return json.Marshal(struct {
		UserID  string         `json:"userId"`
		Message messagePayload `json:"message"`
	}{UserID: userID, Message: msg})
}

func buildNotifyTypingBody(userID string, typing typingPayload) ([]byte, error) {
	return json.Marshal(struct {
		UserID string        `json:"userId"`
		Typing typingPayload `json:"typing"`
	}{UserID: userID, Typing: typing})
}

// notifyMessageDelivered pushes a live message event. Best-effort: if the
// secret is unset or the call fails, the message is already persisted.
func (n *notifier) notifyMessageDelivered(ctx context.Context, userID string, msg messagePayload) {
	secret := os.Getenv("INTERNAL_API_SECRET")
	if secret == "" {
		n.logger.Debug("bot-worker: SSE bridge disabled (INTERNAL_API_SECRET unset) — skipping message notify")
		return
	}
	body, err := buildNotifyMessageBody(userID, msg)
	if err != nil {
		n.logger.Warn("bot-worker: build notify-message body failed", "error", err)
		return
	}
	n.post(ctx, notifyMessageURL(internalAPIBase()), secret, body, "notify-message")
}

// notifyTyping pushes a live typing-indicator event. Best-effort, mirrors
// notifyMessageDelivered.
func (n *notifier) notifyTyping(ctx context.Context, userID string, typing typingPayload) {
	secret := os.Getenv("INTERNAL_API_SECRET")
	if secret == "" {
		n.logger.Debug("bot-worker: SSE bridge disabled (INTERNAL_API_SECRET unset) — skipping typing notify")
		return
	}
	body, err := buildNotifyTypingBody(userID, typing)
	if err != nil {
		n.logger.Warn("bot-worker: build notify-typing body failed", "error", err)
		return
	}
	n.post(ctx, notifyTypingURL(internalAPIBase()), secret, body, "notify-typing")
}

// post issues the best-effort POST with the x-internal-secret header. Any error
// is logged (not returned), matching the Node try/catch around fetch.
func (n *notifier) post(ctx context.Context, endpoint, secret string, body []byte, label string) {
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		n.logger.Warn(fmt.Sprintf("bot-worker: %s build request failed", label), "error", err)
		return
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-internal-secret", secret)

	resp, err := n.http.Do(req)
	if err != nil {
		n.logger.Warn(fmt.Sprintf("bot-worker: %s bridge failed", label), "error", err)
		return
	}
	_ = resp.Body.Close()
}
