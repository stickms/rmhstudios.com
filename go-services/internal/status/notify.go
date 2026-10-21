package status

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Notification is one event pushed to subscribers: an incident opened,
// updated or resolved, a maintenance window scheduled, started, completed or
// cancelled, or an announcement posted.
type Notification struct {
	Event        string        `json:"event"`
	Incident     *Incident     `json:"incident,omitempty"`
	Maintenance  *Maintenance  `json:"maintenance,omitempty"`
	Announcement *Announcement `json:"announcement,omitempty"`
}

// Notifier delivers notifications. Implementations must not block the caller.
type Notifier interface {
	Notify(n Notification)
}

// WebhookNotifier POSTs every notification to a list of URLs. Discord and
// Slack incoming-webhook URLs get their native message shapes, so a channel
// subscribed to the status page reads like a human posted it; every other URL
// gets the generic JSON envelope, signed with HMAC-SHA256 when a secret is set
// (`X-Status-Signature: sha256=<hex>` over the raw body).
type WebhookNotifier struct {
	URLs    []string
	Secret  string
	PageURL string
	Client  *http.Client
	Logger  Warner
	// queue decouples delivery from the prober: Notify only enqueues.
	queue chan Notification
}

// NewWebhookNotifier builds a notifier. Delivery starts when Run is called
// (Service.Start does); notifications raised before that wait in the queue.
// Returns nil when there are no usable URLs.
func NewWebhookNotifier(urls []string, secret, pageURL string, logger Warner) *WebhookNotifier {
	var clean []string
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://") {
			clean = append(clean, u)
		}
	}
	if len(clean) == 0 {
		return nil
	}
	w := &WebhookNotifier{
		URLs:    clean,
		Secret:  secret,
		PageURL: strings.TrimRight(pageURL, "/"),
		Client:  &http.Client{Timeout: 10 * time.Second},
		Logger:  logger,
		queue:   make(chan Notification, 256),
	}
	return w
}

// Notify enqueues n, dropping it (with a warning) if the queue is full rather
// than ever stalling a probe cycle on a slow chat service.
func (w *WebhookNotifier) Notify(n Notification) {
	if w == nil {
		return
	}
	select {
	case w.queue <- n:
	default:
		if w.Logger != nil {
			w.Logger.Warn("status: webhook queue full — dropping notification", "event", n.Event)
		}
	}
}

// Run delivers queued notifications until ctx is cancelled.
func (w *WebhookNotifier) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case n := <-w.queue:
			for _, u := range w.URLs {
				w.deliver(ctx, u, n)
			}
		}
	}
}

// deliver POSTs one notification to one URL, retrying once on failure.
func (w *WebhookNotifier) deliver(ctx context.Context, url string, n Notification) {
	body, err := w.payload(url, n)
	if err != nil {
		return
	}
	for attempt := 0; attempt < 2; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "rmh-status-webhook/1.0")
		req.Header.Set("X-Status-Event", n.Event)
		if w.Secret != "" && webhookFlavor(url) == "generic" {
			req.Header.Set("X-Status-Signature", "sha256="+SignPayload(w.Secret, body))
		}
		resp, err := w.Client.Do(req)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 300 {
				return
			}
			err = fmt.Errorf("HTTP %d", resp.StatusCode)
		}
		if attempt == 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}
		if w.Logger != nil {
			w.Logger.Warn("status: webhook delivery failed", "event", n.Event, "error", err)
		}
	}
}

// SignPayload is the hex HMAC-SHA256 of body under secret.
func SignPayload(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func webhookFlavor(url string) string {
	switch {
	case strings.Contains(url, "discord.com/api/webhooks") || strings.Contains(url, "discordapp.com/api/webhooks"):
		return "discord"
	case strings.Contains(url, "hooks.slack.com"):
		return "slack"
	}
	return "generic"
}

// Summary renders a notification as one line of text.
func (n Notification) Summary() (title, body, link string) {
	switch {
	case n.Incident != nil:
		inc := n.Incident
		title = inc.Title
		if len(inc.Updates) > 0 {
			body = inc.Updates[len(inc.Updates)-1].Body
		}
		link = "/incidents/" + inc.ID
		switch n.Event {
		case "incident.created":
			title = "New incident: " + title
		case "incident.resolved":
			title = "Resolved: " + title
		default:
			title = "Update: " + title
		}
	case n.Maintenance != nil:
		m := n.Maintenance
		link = "/#maintenance"
		when := fmt.Sprintf("%s → %s", time.UnixMilli(m.StartsAt).UTC().Format("2 Jan 15:04"), time.UnixMilli(m.EndsAt).UTC().Format("2 Jan 15:04 UTC"))
		switch n.Event {
		case "maintenance.scheduled":
			title, body = "Maintenance scheduled: "+m.Title, when
		case "maintenance.started":
			title, body = "Maintenance in progress: "+m.Title, when
		case "maintenance.completed":
			title, body = "Maintenance completed: "+m.Title, when
		default:
			title, body = "Maintenance cancelled: "+m.Title, when
		}
		if m.Description != "" {
			body = m.Description + "\n" + body
		}
	case n.Announcement != nil:
		title, body, link = "Announcement", n.Announcement.Message, "/"
	}
	return title, body, link
}

func (w *WebhookNotifier) payload(url string, n Notification) ([]byte, error) {
	title, body, link := n.Summary()
	full := w.PageURL + link
	switch webhookFlavor(url) {
	case "discord":
		color := 0x2997ff
		switch {
		case strings.HasSuffix(n.Event, "resolved") || strings.HasSuffix(n.Event, "completed"):
			color = 0x30d158
		case n.Incident != nil && impactRank[n.Incident.Impact] >= impactRank[ImpactMajor]:
			color = 0xff453a
		case n.Incident != nil:
			color = 0xff9f0a
		}
		return json.Marshal(map[string]any{
			"username": "RMH Studios Status",
			"embeds": []map[string]any{{
				"title":       truncate(title, 250),
				"description": truncate(body, 3500),
				"url":         full,
				"color":       color,
				"timestamp":   time.Now().UTC().Format(time.RFC3339),
			}},
		})
	case "slack":
		return json.Marshal(map[string]any{
			"text": fmt.Sprintf("*%s*\n%s\n<%s|View on the status page>", title, body, full),
		})
	}
	return json.Marshal(struct {
		Notification
		Title  string `json:"title"`
		Text   string `json:"text"`
		URL    string `json:"url"`
		SentAt string `json:"sentAt"`
	}{n, title, body, full, time.Now().UTC().Format(isoMillis)})
}
