package status

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Incidents, scheduled maintenance and announcements — the human side of a
// status page. Automatic incidents are opened and resolved by the prober's
// debounced failure streaks (track.go); manual incidents, maintenance windows
// and announcements are written through the token-guarded admin API (api.go).
// All three persist to IncidentsFileName so a restart loses nothing.

// Incident lifecycle states, the vocabulary every hosted status page shares.
const (
	StateInvestigating = "investigating"
	StateIdentified    = "identified"
	StateMonitoring    = "monitoring"
	StateResolved      = "resolved"
)

// Impact levels, ordered by severity.
const (
	ImpactNone     = "none"
	ImpactMinor    = "minor"
	ImpactMajor    = "major"
	ImpactCritical = "critical"
)

var impactRank = map[string]int{ImpactNone: 0, ImpactMinor: 1, ImpactMajor: 2, ImpactCritical: 3}

func validState(s string) bool {
	switch s {
	case StateInvestigating, StateIdentified, StateMonitoring, StateResolved:
		return true
	}
	return false
}

func validImpact(s string) bool { _, ok := impactRank[s]; return ok }

// IncidentUpdate is one entry on an incident's public timeline.
type IncidentUpdate struct {
	At    int64  `json:"at"`
	State string `json:"state"`
	Body  string `json:"body"`
}

// Incident is an automatic or manual incident.
type Incident struct {
	ID         string           `json:"id"`
	Title      string           `json:"title"`
	Kind       string           `json:"kind"` // "auto" | "manual"
	Impact     string           `json:"impact"`
	State      string           `json:"state"`
	Components []string         `json:"components"`
	StartedAt  int64            `json:"startedAt"`
	ResolvedAt int64            `json:"resolvedAt,omitempty"`
	UpdatedAt  int64            `json:"updatedAt"`
	Updates    []IncidentUpdate `json:"updates"`
	Postmortem string           `json:"postmortem,omitempty"`
	// Automatic-incident evidence.
	FailedChecks int    `json:"failedChecks,omitempty"`
	Worst        Status `json:"worst,omitempty"`
	Category     string `json:"category,omitempty"`
}

// Resolved reports whether the incident is over.
func (i *Incident) Resolved() bool { return i.State == StateResolved }

// Duration is how long the incident lasted, or has lasted so far.
func (i *Incident) Duration(now time.Time) time.Duration {
	end := i.ResolvedAt
	if end == 0 {
		end = now.UnixMilli()
	}
	if end < i.StartedAt {
		return 0
	}
	return time.Duration(end-i.StartedAt) * time.Millisecond
}

// Maintenance is a scheduled maintenance window.
type Maintenance struct {
	ID          string           `json:"id"`
	Title       string           `json:"title"`
	Description string           `json:"description,omitempty"`
	Components  []string         `json:"components"`
	StartsAt    int64            `json:"startsAt"`
	EndsAt      int64            `json:"endsAt"`
	CreatedAt   int64            `json:"createdAt"`
	CancelledAt int64            `json:"cancelledAt,omitempty"`
	Updates     []IncidentUpdate `json:"updates"`
	// Notification bookkeeping, so start/complete are announced exactly once.
	NotifiedStart bool `json:"notifiedStart,omitempty"`
	NotifiedEnd   bool `json:"notifiedEnd,omitempty"`
}

// Maintenance states.
const (
	MaintScheduled  = "scheduled"
	MaintInProgress = "in_progress"
	MaintCompleted  = "completed"
	MaintCancelled  = "cancelled"
)

// State derives the window's state from the clock.
func (m *Maintenance) State(now time.Time) string {
	ms := now.UnixMilli()
	switch {
	case m.CancelledAt != 0:
		return MaintCancelled
	case ms < m.StartsAt:
		return MaintScheduled
	case ms < m.EndsAt:
		return MaintInProgress
	}
	return MaintCompleted
}

// Covers reports whether the window affects service at instant `at`.
func (m *Maintenance) Covers(service string, at time.Time) bool {
	if m.State(at) != MaintInProgress {
		return false
	}
	if len(m.Components) == 0 {
		return true // a platform-wide window
	}
	for _, c := range m.Components {
		if c == service {
			return true
		}
	}
	return false
}

// Announcement is a banner message shown above the dashboard.
type Announcement struct {
	ID        string `json:"id"`
	Message   string `json:"message"`
	Level     string `json:"level"` // info | warning | critical
	Link      string `json:"link,omitempty"`
	StartsAt  int64  `json:"startsAt,omitempty"`
	EndsAt    int64  `json:"endsAt,omitempty"`
	CreatedAt int64  `json:"createdAt"`
}

// Active reports whether the announcement should show at now.
func (a *Announcement) Active(now time.Time) bool {
	ms := now.UnixMilli()
	return (a.StartsAt == 0 || ms >= a.StartsAt) && (a.EndsAt == 0 || ms < a.EndsAt)
}

// Store holds incidents, maintenance windows and announcements.
type Store struct {
	mu            sync.RWMutex
	path          string
	logger        Warner
	notifier      Notifier
	components    map[string]string // service name -> group
	incidents     []*Incident
	maintenance   []*Maintenance
	announcements []*Announcement
	maxIncidents  int
	// static is the env-configured announcement, never persisted.
	static *Announcement
	// ver counts persisted mutations; the response cache keys validity on it.
	ver atomic.Uint64
}

// storeFile is the on-disk shape of IncidentsFileName.
type storeFile struct {
	Incidents     []*Incident     `json:"incidents"`
	Maintenance   []*Maintenance  `json:"maintenance"`
	Announcements []*Announcement `json:"announcements"`
}

// NewStore builds a store for the given targets, loading path if it exists.
// path "" keeps everything in memory.
func NewStore(targets []Target, path string, logger Warner, notifier Notifier) *Store {
	s := &Store{
		path:         path,
		logger:       logger,
		notifier:     notifier,
		components:   make(map[string]string, len(targets)),
		maxIncidents: 500,
	}
	for _, t := range targets {
		s.components[t.Name] = t.Group
	}
	s.load()
	return s
}

// SetStaticAnnouncement installs an env-configured banner.
func (s *Store) SetStaticAnnouncement(msg, level, link string) {
	if strings.TrimSpace(msg) == "" {
		return
	}
	if level == "" {
		level = "info"
	}
	s.mu.Lock()
	s.static = &Announcement{ID: "env", Message: msg, Level: level, Link: link}
	s.mu.Unlock()
}

func (s *Store) load() {
	if s.path == "" {
		return
	}
	data, err := os.ReadFile(s.path)
	if err != nil {
		if !os.IsNotExist(err) && s.logger != nil {
			s.logger.Warn("status: could not read incidents", "path", s.path, "error", err)
		}
		return
	}
	var f storeFile
	if err := json.Unmarshal(data, &f); err != nil {
		if s.logger != nil {
			s.logger.Warn("status: incidents file corrupt — starting fresh", "path", s.path, "error", err)
		}
		return
	}
	s.incidents = f.Incidents
	s.maintenance = f.Maintenance
	s.announcements = f.Announcements
}

// Version changes on every store mutation.
func (s *Store) Version() uint64 { return s.ver.Load() }

// saveLocked persists the store. Caller holds s.mu (read or write).
func (s *Store) saveLocked() {
	s.ver.Add(1)
	if s.path == "" {
		return
	}
	data, err := json.Marshal(storeFile{Incidents: s.incidents, Maintenance: s.maintenance, Announcements: s.announcements})
	if err == nil {
		err = writeFileAtomic(s.path, data)
	}
	if err != nil && s.logger != nil {
		s.logger.Warn("status: could not persist incidents", "path", s.path, "error", err)
	}
}

func newID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

// ── Automatic incidents ─────────────────────────────────────────────────────

// autoImpact maps an observed state onto an impact level. An outage of a Core
// component is critical: those are the surfaces every visitor touches.
func autoImpact(st Status, group string) string {
	switch {
	case st == StatusDown && group == "Core":
		return ImpactCritical
	case st == StatusDown:
		return ImpactMajor
	}
	return ImpactMinor
}

// autoCause phrases a failure for a timeline: the probe's own detail, led by
// the category only when the detail does not already say it.
func autoCause(label, detail string) string {
	switch {
	case detail == "":
		return strings.ToLower(label)
	case label == "" || strings.Contains(strings.ToLower(detail), strings.ToLower(label)):
		return detail
	}
	return strings.ToLower(label) + ": " + detail
}

func autoTitle(service string, st Status) string {
	if st == StatusDown {
		return service + " outage"
	}
	return service + " degraded"
}

// openAutoLocked returns the unresolved automatic incident for service.
func (s *Store) openAutoLocked(service string) *Incident {
	for i := len(s.incidents) - 1; i >= 0; i-- {
		inc := s.incidents[i]
		if inc.Kind == "auto" && !inc.Resolved() && len(inc.Components) == 1 && inc.Components[0] == service {
			return inc
		}
	}
	return nil
}

// HandleEvents turns the prober's lifecycle events into automatic incidents.
func (s *Store) HandleEvents(events []Event) {
	var notes []Notification
	s.mu.Lock()
	changed := false
	for _, ev := range events {
		open := s.openAutoLocked(ev.Service)
		switch ev.Kind {
		case EventFailing:
			if open != nil {
				continue
			}
			label := CategoryLabel(ev.Category)
			if label == "" {
				label = string(ev.Status)
			}
			inc := &Incident{
				ID:           newID(),
				Title:        autoTitle(ev.Service, ev.Status),
				Kind:         "auto",
				Impact:       autoImpact(ev.Status, ev.Group),
				State:        StateInvestigating,
				Components:   []string{ev.Service},
				StartedAt:    ev.At,
				UpdatedAt:    ev.Now,
				FailedChecks: ev.Checks,
				Worst:        ev.Status,
				Category:     ev.Category,
				Updates: []IncidentUpdate{{
					At:    ev.Now,
					State: StateInvestigating,
					Body: fmt.Sprintf("Automated monitoring detected a problem with %s — %s. Failing since %s.",
						ev.Service, autoCause(label, ev.Detail), time.UnixMilli(ev.At).UTC().Format("15:04:05 UTC")),
				}},
			}
			s.incidents = append(s.incidents, inc)
			s.trimLocked()
			changed = true
			notes = append(notes, Notification{Event: "incident.created", Incident: cloneIncident(inc)})
		case EventStillFailing:
			if open == nil {
				continue
			}
			if ev.Checks > open.FailedChecks {
				open.FailedChecks = ev.Checks
			} else {
				open.FailedChecks++
			}
			open.UpdatedAt = ev.Now
			if ev.Status == StatusDown && open.Worst != StatusDown {
				open.Worst = StatusDown
				open.Title = autoTitle(ev.Service, StatusDown)
				if imp := autoImpact(StatusDown, ev.Group); impactRank[imp] > impactRank[open.Impact] {
					open.Impact = imp
				}
				open.Updates = append(open.Updates, IncidentUpdate{
					At: ev.Now, State: open.State,
					Body: fmt.Sprintf("Escalated to an outage: %s.", ev.Detail),
				})
				notes = append(notes, Notification{Event: "incident.updated", Incident: cloneIncident(open)})
			}
			changed = true
		case EventRecovered:
			if open == nil {
				continue
			}
			open.State = StateResolved
			open.ResolvedAt = ev.At
			open.UpdatedAt = ev.Now
			open.Updates = append(open.Updates, IncidentUpdate{
				At: ev.Now, State: StateResolved,
				Body: fmt.Sprintf("%s recovered automatically after %s (%d failed checks).",
					ev.Service, HumanDuration(open.Duration(time.UnixMilli(ev.At))), open.FailedChecks),
			})
			changed = true
			notes = append(notes, Notification{Event: "incident.resolved", Incident: cloneIncident(open)})
		}
	}
	if changed {
		s.saveLocked()
	}
	s.mu.Unlock()
	s.notify(notes)
}

func (s *Store) trimLocked() {
	if s.maxIncidents > 0 && len(s.incidents) > s.maxIncidents {
		s.incidents = s.incidents[len(s.incidents)-s.maxIncidents:]
	}
}

func (s *Store) notify(notes []Notification) {
	if s.notifier == nil {
		return
	}
	for _, n := range notes {
		s.notifier.Notify(n)
	}
}

// ── Maintenance ─────────────────────────────────────────────────────────────

// InMaintenance reports whether service is inside an active window at `at`.
func (s *Store) InMaintenance(service string, at time.Time) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, m := range s.maintenance {
		if m.Covers(service, at) {
			return true
		}
	}
	return false
}

// Tick announces maintenance windows that started or ended since the last
// tick. Called once per probe cycle.
func (s *Store) Tick(now time.Time) {
	var notes []Notification
	s.mu.Lock()
	changed := false
	for _, m := range s.maintenance {
		switch m.State(now) {
		case MaintInProgress:
			if !m.NotifiedStart {
				m.NotifiedStart = true
				changed = true
				notes = append(notes, Notification{Event: "maintenance.started", Maintenance: cloneMaint(m)})
			}
		case MaintCompleted:
			if !m.NotifiedEnd {
				m.NotifiedStart, m.NotifiedEnd = true, true
				changed = true
				notes = append(notes, Notification{Event: "maintenance.completed", Maintenance: cloneMaint(m)})
			}
		}
	}
	if changed {
		s.saveLocked()
	}
	s.mu.Unlock()
	s.notify(notes)
}

// ── Reads ───────────────────────────────────────────────────────────────────

// Incidents returns copies of every incident, newest first.
func (s *Store) Incidents() []Incident {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Incident, 0, len(s.incidents))
	for i := len(s.incidents) - 1; i >= 0; i-- {
		out = append(out, *cloneIncident(s.incidents[i]))
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].StartedAt > out[b].StartedAt })
	return out
}

// Incident returns one incident by ID.
func (s *Store) Incident(id string) (Incident, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, inc := range s.incidents {
		if inc.ID == id {
			return *cloneIncident(inc), true
		}
	}
	return Incident{}, false
}

// Maintenances returns copies of every window, soonest first.
func (s *Store) Maintenances() []Maintenance {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Maintenance, 0, len(s.maintenance))
	for _, m := range s.maintenance {
		out = append(out, *cloneMaint(m))
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].StartsAt < out[b].StartsAt })
	return out
}

// Announcements returns the announcements active at now (env banner first).
func (s *Store) Announcements(now time.Time) []Announcement {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []Announcement
	if s.static != nil {
		out = append(out, *s.static)
	}
	for _, a := range s.announcements {
		if a.Active(now) {
			out = append(out, *a)
		}
	}
	return out
}

// AllAnnouncements returns every stored announcement, including expired ones.
func (s *Store) AllAnnouncements() []Announcement {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Announcement, 0, len(s.announcements))
	for _, a := range s.announcements {
		out = append(out, *a)
	}
	return out
}

func cloneIncident(i *Incident) *Incident {
	cp := *i
	cp.Components = append([]string(nil), i.Components...)
	cp.Updates = append([]IncidentUpdate(nil), i.Updates...)
	return &cp
}

func cloneMaint(m *Maintenance) *Maintenance {
	cp := *m
	cp.Components = append([]string(nil), m.Components...)
	cp.Updates = append([]IncidentUpdate(nil), m.Updates...)
	return &cp
}

// ── Writes (admin API) ──────────────────────────────────────────────────────

// ErrNotFound is returned by admin writes for an unknown ID.
var ErrNotFound = errors.New("not found")

// IncidentInput is the admin API's create/patch body. Pointer fields are
// optional on patch.
type IncidentInput struct {
	Title      *string   `json:"title"`
	Impact     *string   `json:"impact"`
	State      *string   `json:"state"`
	Components *[]string `json:"components"`
	Body       *string   `json:"body"`
	Postmortem *string   `json:"postmortem"`
	StartedAt  *int64    `json:"startedAt"`
}

func (s *Store) validComponents(cs []string) error {
	for _, c := range cs {
		if _, ok := s.components[c]; !ok {
			return fmt.Errorf("unknown component %q", c)
		}
	}
	return nil
}

func clean(s string, max int) string { return truncate(strings.TrimSpace(s), max) }

// CreateIncident opens a manual incident.
func (s *Store) CreateIncident(in IncidentInput, now time.Time) (Incident, error) {
	if in.Title == nil || strings.TrimSpace(*in.Title) == "" {
		return Incident{}, errors.New("title is required")
	}
	inc := &Incident{
		ID:         newID(),
		Title:      clean(*in.Title, 200),
		Kind:       "manual",
		Impact:     ImpactMinor,
		State:      StateInvestigating,
		StartedAt:  now.UnixMilli(),
		UpdatedAt:  now.UnixMilli(),
		Components: []string{},
	}
	if in.Impact != nil {
		if !validImpact(*in.Impact) {
			return Incident{}, fmt.Errorf("impact must be one of none, minor, major, critical")
		}
		inc.Impact = *in.Impact
	}
	if in.State != nil {
		if !validState(*in.State) {
			return Incident{}, fmt.Errorf("state must be one of investigating, identified, monitoring, resolved")
		}
		inc.State = *in.State
	}
	if in.StartedAt != nil && *in.StartedAt > 0 && *in.StartedAt <= now.UnixMilli() {
		inc.StartedAt = *in.StartedAt
	}
	if in.Components != nil {
		if err := s.validComponents(*in.Components); err != nil {
			return Incident{}, err
		}
		inc.Components = append([]string(nil), (*in.Components)...)
	}
	body := "We are investigating this issue."
	if in.Body != nil && strings.TrimSpace(*in.Body) != "" {
		body = clean(*in.Body, 5000)
	}
	inc.Updates = []IncidentUpdate{{At: now.UnixMilli(), State: inc.State, Body: body}}
	if inc.State == StateResolved {
		inc.ResolvedAt = now.UnixMilli()
	}
	if in.Postmortem != nil {
		inc.Postmortem = clean(*in.Postmortem, 20000)
	}

	s.mu.Lock()
	s.incidents = append(s.incidents, inc)
	s.trimLocked()
	s.saveLocked()
	out := cloneIncident(inc)
	s.mu.Unlock()
	s.notify([]Notification{{Event: "incident.created", Incident: out}})
	return *out, nil
}

func (s *Store) findIncidentLocked(id string) *Incident {
	for _, inc := range s.incidents {
		if inc.ID == id {
			return inc
		}
	}
	return nil
}

// AddIncidentUpdate appends a timeline entry and moves the incident's state.
func (s *Store) AddIncidentUpdate(id string, in IncidentInput, now time.Time) (Incident, error) {
	if in.Body == nil || strings.TrimSpace(*in.Body) == "" {
		return Incident{}, errors.New("body is required")
	}
	s.mu.Lock()
	inc := s.findIncidentLocked(id)
	if inc == nil {
		s.mu.Unlock()
		return Incident{}, ErrNotFound
	}
	state := inc.State
	if in.State != nil {
		if !validState(*in.State) {
			s.mu.Unlock()
			return Incident{}, fmt.Errorf("state must be one of investigating, identified, monitoring, resolved")
		}
		state = *in.State
	}
	if in.Impact != nil && validImpact(*in.Impact) {
		inc.Impact = *in.Impact
	}
	inc.Updates = append(inc.Updates, IncidentUpdate{At: now.UnixMilli(), State: state, Body: clean(*in.Body, 5000)})
	event := "incident.updated"
	if state == StateResolved && inc.State != StateResolved {
		inc.ResolvedAt = now.UnixMilli()
		event = "incident.resolved"
	} else if state != StateResolved {
		inc.ResolvedAt = 0
	}
	inc.State = state
	inc.UpdatedAt = now.UnixMilli()
	s.saveLocked()
	out := cloneIncident(inc)
	s.mu.Unlock()
	s.notify([]Notification{{Event: event, Incident: out}})
	return *out, nil
}

// PatchIncident edits an incident's title, impact, components or postmortem.
func (s *Store) PatchIncident(id string, in IncidentInput, now time.Time) (Incident, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inc := s.findIncidentLocked(id)
	if inc == nil {
		return Incident{}, ErrNotFound
	}
	if in.Title != nil && strings.TrimSpace(*in.Title) != "" {
		inc.Title = clean(*in.Title, 200)
	}
	if in.Impact != nil {
		if !validImpact(*in.Impact) {
			return Incident{}, fmt.Errorf("impact must be one of none, minor, major, critical")
		}
		inc.Impact = *in.Impact
	}
	if in.Components != nil {
		if err := s.validComponents(*in.Components); err != nil {
			return Incident{}, err
		}
		inc.Components = append([]string(nil), (*in.Components)...)
	}
	if in.Postmortem != nil {
		inc.Postmortem = clean(*in.Postmortem, 20000)
	}
	inc.UpdatedAt = now.UnixMilli()
	s.saveLocked()
	return *cloneIncident(inc), nil
}

// DeleteIncident removes an incident (for mistakes, not for history).
func (s *Store) DeleteIncident(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, inc := range s.incidents {
		if inc.ID == id {
			s.incidents = append(s.incidents[:i], s.incidents[i+1:]...)
			s.saveLocked()
			return nil
		}
	}
	return ErrNotFound
}

// MaintenanceInput is the admin API's maintenance body.
type MaintenanceInput struct {
	Title       *string   `json:"title"`
	Description *string   `json:"description"`
	Components  *[]string `json:"components"`
	StartsAt    *int64    `json:"startsAt"`
	EndsAt      *int64    `json:"endsAt"`
	Body        *string   `json:"body"`
}

// CreateMaintenance schedules a window.
func (s *Store) CreateMaintenance(in MaintenanceInput, now time.Time) (Maintenance, error) {
	if in.Title == nil || strings.TrimSpace(*in.Title) == "" {
		return Maintenance{}, errors.New("title is required")
	}
	if in.StartsAt == nil || in.EndsAt == nil || *in.EndsAt <= *in.StartsAt {
		return Maintenance{}, errors.New("startsAt and endsAt (unix ms) are required and endsAt must be after startsAt")
	}
	m := &Maintenance{
		ID:         newID(),
		Title:      clean(*in.Title, 200),
		StartsAt:   *in.StartsAt,
		EndsAt:     *in.EndsAt,
		CreatedAt:  now.UnixMilli(),
		Components: []string{},
	}
	if in.Description != nil {
		m.Description = clean(*in.Description, 5000)
	}
	if in.Components != nil {
		if err := s.validComponents(*in.Components); err != nil {
			return Maintenance{}, err
		}
		m.Components = append([]string(nil), (*in.Components)...)
	}
	s.mu.Lock()
	s.maintenance = append(s.maintenance, m)
	s.saveLocked()
	out := cloneMaint(m)
	s.mu.Unlock()
	s.notify([]Notification{{Event: "maintenance.scheduled", Maintenance: out}})
	return *out, nil
}

// UpdateMaintenance edits a window and optionally posts a timeline update.
func (s *Store) UpdateMaintenance(id string, in MaintenanceInput, now time.Time) (Maintenance, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var m *Maintenance
	for _, x := range s.maintenance {
		if x.ID == id {
			m = x
		}
	}
	if m == nil {
		return Maintenance{}, ErrNotFound
	}
	if in.Title != nil && strings.TrimSpace(*in.Title) != "" {
		m.Title = clean(*in.Title, 200)
	}
	if in.Description != nil {
		m.Description = clean(*in.Description, 5000)
	}
	if in.Components != nil {
		if err := s.validComponents(*in.Components); err != nil {
			return Maintenance{}, err
		}
		m.Components = append([]string(nil), (*in.Components)...)
	}
	starts, ends := m.StartsAt, m.EndsAt
	if in.StartsAt != nil {
		starts = *in.StartsAt
	}
	if in.EndsAt != nil {
		ends = *in.EndsAt
	}
	if ends <= starts {
		return Maintenance{}, errors.New("endsAt must be after startsAt")
	}
	m.StartsAt, m.EndsAt = starts, ends
	if in.Body != nil && strings.TrimSpace(*in.Body) != "" {
		m.Updates = append(m.Updates, IncidentUpdate{At: now.UnixMilli(), State: m.State(now), Body: clean(*in.Body, 5000)})
	}
	s.saveLocked()
	return *cloneMaint(m), nil
}

// CancelMaintenance cancels a window that has not finished.
func (s *Store) CancelMaintenance(id string, now time.Time) (Maintenance, error) {
	s.mu.Lock()
	var m *Maintenance
	for _, x := range s.maintenance {
		if x.ID == id {
			m = x
		}
	}
	if m == nil {
		s.mu.Unlock()
		return Maintenance{}, ErrNotFound
	}
	if m.CancelledAt == 0 {
		m.CancelledAt = now.UnixMilli()
		m.Updates = append(m.Updates, IncidentUpdate{At: now.UnixMilli(), State: MaintCancelled, Body: "This maintenance has been cancelled."})
	}
	s.saveLocked()
	out := cloneMaint(m)
	s.mu.Unlock()
	s.notify([]Notification{{Event: "maintenance.cancelled", Maintenance: out}})
	return *out, nil
}

// DeleteMaintenance removes a window.
func (s *Store) DeleteMaintenance(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, m := range s.maintenance {
		if m.ID == id {
			s.maintenance = append(s.maintenance[:i], s.maintenance[i+1:]...)
			s.saveLocked()
			return nil
		}
	}
	return ErrNotFound
}

// AnnouncementInput is the admin API's announcement body.
type AnnouncementInput struct {
	Message  string `json:"message"`
	Level    string `json:"level"`
	Link     string `json:"link"`
	StartsAt int64  `json:"startsAt"`
	EndsAt   int64  `json:"endsAt"`
}

// CreateAnnouncement posts a banner.
func (s *Store) CreateAnnouncement(in AnnouncementInput, now time.Time) (Announcement, error) {
	if strings.TrimSpace(in.Message) == "" {
		return Announcement{}, errors.New("message is required")
	}
	switch in.Level {
	case "":
		in.Level = "info"
	case "info", "warning", "critical":
	default:
		return Announcement{}, errors.New("level must be info, warning or critical")
	}
	if in.Link != "" && !strings.HasPrefix(in.Link, "https://") && !strings.HasPrefix(in.Link, "/") {
		return Announcement{}, errors.New("link must be https:// or a path")
	}
	a := &Announcement{
		ID: newID(), Message: clean(in.Message, 1000), Level: in.Level, Link: clean(in.Link, 500),
		StartsAt: in.StartsAt, EndsAt: in.EndsAt, CreatedAt: now.UnixMilli(),
	}
	s.mu.Lock()
	s.announcements = append(s.announcements, a)
	s.saveLocked()
	s.mu.Unlock()
	s.notify([]Notification{{Event: "announcement.created", Announcement: a}})
	return *a, nil
}

// DeleteAnnouncement removes a banner.
func (s *Store) DeleteAnnouncement(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, a := range s.announcements {
		if a.ID == id {
			s.announcements = append(s.announcements[:i], s.announcements[i+1:]...)
			s.saveLocked()
			return nil
		}
	}
	return ErrNotFound
}

// HumanDuration renders a duration the way an incident timeline says it:
// "45s", "12m", "3h 20m", "2d 4h".
func HumanDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		m := int(d.Minutes())
		s := int(d.Seconds()) % 60
		if s == 0 || m >= 10 {
			return fmt.Sprintf("%dm", m)
		}
		return fmt.Sprintf("%dm %ds", m, s)
	case d < 24*time.Hour:
		h := int(d.Hours())
		m := int(d.Minutes()) % 60
		if m == 0 {
			return fmt.Sprintf("%dh", h)
		}
		return fmt.Sprintf("%dh %dm", h, m)
	}
	days := int(d.Hours()) / 24
	h := int(d.Hours()) % 24
	if h == 0 {
		return fmt.Sprintf("%dd", days)
	}
	return fmt.Sprintf("%dd %dh", days, h)
}
