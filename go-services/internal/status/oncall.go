package status

import (
	"context"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/oncall"
)

// The status service's two jobs for on-call (deploy/oncall-watchdog):
//
//  1. Heartbeat. After each probe cycle (at most once a minute) it checks in
//     as "status". The watchdog runs off the VPS and pages when check-ins
//     stop — the one way a dead host, a dead Docker or a wedged prober gets
//     reported, since none of them can report themselves.
//  2. Alarms. Automatic incidents become watchdog alarms (alarm id "STATUS",
//     instance = the component), so a Core outage pages @oncall with an Ack
//     button instead of only colouring the dashboard.

// HeartbeatInterval is how often the status service checks in.
const HeartbeatInterval = time.Minute

// watchdogCovered are components the watchdog already probes itself from
// outside (alarms A01 / A02): forwarding their incidents too would page twice
// for one outage.
var watchdogCovered = map[string]bool{"Website": true, "App readiness": true}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slug(s string) string {
	s = strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if len(s) > 40 {
		s = s[:40]
	}
	return s
}

// alertFor maps a notification onto a watchdog alarm; ok=false means "not for
// on-call". Manual incidents are skipped (a human posted them, and is already
// on it); so are maintenance and announcements.
func alertFor(n Notification, pageURL string) (a oncall.Alert, ok bool) {
	inc := n.Incident
	if inc == nil || inc.Kind != "auto" || len(inc.Components) != 1 || watchdogCovered[inc.Components[0]] {
		return a, false
	}
	state := "firing"
	switch n.Event {
	case "incident.created", "incident.updated":
	case "incident.resolved":
		state = "resolved"
	default:
		return a, false
	}
	// Down (critical/major) is the page; degraded is a business-hours Sev3.
	sev := 3
	if inc.Impact == ImpactCritical || inc.Impact == ImpactMajor {
		sev = 2
	}
	detail := ""
	if len(inc.Updates) > 0 {
		detail = inc.Updates[len(inc.Updates)-1].Body
	}
	if pageURL != "" {
		detail = strings.TrimSpace(detail + "\n" + pageURL + "/incidents/" + inc.ID)
	}
	return oncall.Alert{
		State:    state,
		ID:       "STATUS",
		Instance: slug(inc.Components[0]),
		Sev:      sev,
		Title:    inc.Title,
		Detail:   detail,
		Runbook:  "status-incident",
		Source:   "status",
	}, true
}

// OncallNotifier forwards automatic incidents to the watchdog. Like
// WebhookNotifier it only enqueues on the prober's goroutine.
type OncallNotifier struct {
	client  *oncall.Client
	pageURL string
	logger  Warner
	queue   chan Notification
}

// NewOncallNotifier returns nil when client is nil (on-call not configured).
func NewOncallNotifier(client *oncall.Client, pageURL string, logger Warner) *OncallNotifier {
	if client == nil {
		return nil
	}
	return &OncallNotifier{client: client, pageURL: pageURL, logger: logger, queue: make(chan Notification, 64)}
}

func (o *OncallNotifier) Notify(n Notification) {
	if o == nil {
		return
	}
	if _, ok := alertFor(n, o.pageURL); !ok {
		return
	}
	select {
	case o.queue <- n:
	default:
		if o.logger != nil {
			o.logger.Warn("status: on-call queue full — dropping alarm", "event", n.Event)
		}
	}
}

func (o *OncallNotifier) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case n := <-o.queue:
			a, _ := alertFor(n, o.pageURL)
			if err := o.client.Send(ctx, a); err != nil && o.logger != nil {
				o.logger.Warn("status: on-call alarm failed", "event", n.Event, "error", err)
			}
		}
	}
}

// multiNotifier fans one notification out to several notifiers.
type multiNotifier []Notifier

func (m multiNotifier) Notify(n Notification) {
	for _, x := range m {
		x.Notify(n)
	}
}

// heartbeater sends at most one check-in per interval, never more than one
// in flight, and never on the prober's goroutine.
type heartbeater struct {
	client   *oncall.Client
	logger   Warner
	interval time.Duration
	last     time.Time
	inFlight atomic.Bool
}

// afterCycle is called once per completed probe cycle.
func (h *heartbeater) afterCycle(ctx context.Context, now time.Time) {
	if h == nil || h.client == nil || now.Sub(h.last) < h.interval || !h.inFlight.CompareAndSwap(false, true) {
		return
	}
	h.last = now
	go func() {
		defer h.inFlight.Store(false)
		if err := h.client.Heartbeat(ctx, "status"); err != nil && h.logger != nil {
			h.logger.Warn("status: on-call heartbeat failed", "error", err)
		}
	}()
}
