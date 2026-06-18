package discordbot

import (
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ─── safePath path-traversal guard ──────────────────────────────────────────

func TestSafePath_Allows(t *testing.T) {
	base := "/srv/clone"
	cases := []struct {
		in   string
		want string
	}{
		{"app/routes/index.tsx", "/srv/clone/app/routes/index.tsx"},
		{"/app/routes/index.tsx", "/srv/clone/app/routes/index.tsx"}, // leading slash stripped
		{"file.txt", "/srv/clone/file.txt"},
		{".", "/srv/clone"}, // resolves to base itself, allowed
	}
	for _, c := range cases {
		got, err := safePath(base, c.in)
		if err != nil {
			t.Fatalf("safePath(%q) unexpected error: %v", c.in, err)
		}
		if got != filepath.Clean(c.want) {
			t.Errorf("safePath(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestSafePath_RejectsTraversal(t *testing.T) {
	base := "/srv/clone"
	bad := []string{
		"../etc/passwd",
		"app/../../etc/passwd",
		"../../secret",
		"..",
	}
	for _, in := range bad {
		if _, err := safePath(base, in); err == nil {
			t.Errorf("safePath(%q) expected traversal error, got nil", in)
		}
	}
}

func TestSafePath_RejectsSiblingPrefix(t *testing.T) {
	// "/srv/clone-evil" shares the "/srv/clone" string prefix but is NOT inside
	// the base dir; the separator check must reject it.
	base := "/srv/clone"
	if _, err := safePath(base, "../clone-evil/x"); err == nil {
		t.Error("expected sibling-prefix path to be rejected")
	}
}

// ─── chat-embed char-budget packing ─────────────────────────────────────────

// helper: total char count of an embed the way buildChatEmbed budgets it.
func embedCharTotal(title, footer string, fields [][2]string) int {
	total := runeLen(title) + runeLen(footer)
	for _, f := range fields {
		total += runeLen(f[0]) + runeLen(f[1])
	}
	return total
}

func TestBuildChatEmbed_RespectsTotalBudget(t *testing.T) {
	// A huge reply should be packed into multiple fields but never exceed the
	// 6000-char total budget.
	message := "tell me a long story"
	username := "tester"
	reply := strings.Repeat("a", 20000)

	embed := buildChatEmbed(message, username, reply)

	var fields [][2]string
	for _, f := range embed.Fields {
		fields = append(fields, [2]string{f.Name, f.Value})
	}
	total := embedCharTotal(embed.Title, embed.Footer.Text, fields)
	if total > embedTotalMax {
		t.Fatalf("embed total %d exceeds budget %d", total, embedTotalMax)
	}
	if len(embed.Fields) < 2 {
		t.Fatalf("expected reply to be split across multiple fields, got %d", len(embed.Fields))
	}
	// Each field value must respect the per-field cap.
	for _, f := range embed.Fields {
		if runeLen(f.Value) > fieldValueMax {
			t.Errorf("field %q value len %d exceeds field cap %d", f.Name, runeLen(f.Value), fieldValueMax)
		}
	}
	// Field count cap.
	if len(embed.Fields) > maxFields {
		t.Errorf("field count %d exceeds %d", len(embed.Fields), maxFields)
	}
}

func TestBuildChatEmbed_TruncationEllipsis(t *testing.T) {
	// When the reply can't fully fit, the last field must end with the ellipsis.
	reply := strings.Repeat("z", 30000)
	embed := buildChatEmbed("hi", "u", reply)
	last := embed.Fields[len(embed.Fields)-1]
	if !strings.HasSuffix(last.Value, "…") {
		t.Errorf("expected truncated last field to end with ellipsis, got tail %q", tail(last.Value, 5))
	}
}

func TestBuildChatEmbed_ShortReply(t *testing.T) {
	embed := buildChatEmbed("hey", "bob", "yo whats good")
	if len(embed.Fields) != 2 {
		t.Fatalf("expected 2 fields (You + Alex), got %d", len(embed.Fields))
	}
	if embed.Fields[0].Name != youFieldName || embed.Fields[1].Name != alexFieldName {
		t.Errorf("unexpected field names: %q / %q", embed.Fields[0].Name, embed.Fields[1].Name)
	}
	if embed.Fields[1].Value != "yo whats good" {
		t.Errorf("reply mangled: %q", embed.Fields[1].Value)
	}
}

func TestBuildChatEmbed_EmptyReply(t *testing.T) {
	embed := buildChatEmbed("hey", "bob", "")
	// Find the Alex field.
	var alex string
	for _, f := range embed.Fields {
		if f.Name == alexFieldName {
			alex = f.Value
		}
	}
	if alex != "(no response)" {
		t.Errorf("expected '(no response)' placeholder, got %q", alex)
	}
}

func tail(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[len(r)-n:])
}

// ─── session 5-minute auto-unlock (injectable clock) ────────────────────────

type fakeClock struct{ now time.Time }

func (f *fakeClock) Now() time.Time          { return f.now }
func (f *fakeClock) advance(d time.Duration) { f.now = f.now.Add(d) }

func newTestRmhbot(clk Clock) *RmhbotService {
	return &RmhbotService{clock: clk, sessions: map[string]*conversationState{}}
}

func TestSessionLock_Unlocked(t *testing.T) {
	clk := &fakeClock{now: time.Unix(1_000_000, 0)}
	s := newTestRmhbot(clk)
	state := &conversationState{} // lockedAt nil
	if s.isSessionLocked(state) {
		t.Fatal("nil lockedAt should be unlocked")
	}
}

func TestSessionLock_RecentlyLocked(t *testing.T) {
	clk := &fakeClock{now: time.Unix(1_000_000, 0)}
	s := newTestRmhbot(clk)
	lockedAt := clk.now
	state := &conversationState{lockedAt: &lockedAt}

	clk.advance(2 * time.Minute) // < 5 min
	if !s.isSessionLocked(state) {
		t.Fatal("session locked 2min ago should still be locked")
	}
	if state.lockedAt == nil {
		t.Fatal("lockedAt should not have been cleared")
	}
}

func TestSessionLock_AutoUnlockAfter5Min(t *testing.T) {
	clk := &fakeClock{now: time.Unix(1_000_000, 0)}
	s := newTestRmhbot(clk)
	lockedAt := clk.now
	state := &conversationState{lockedAt: &lockedAt}

	clk.advance(5*time.Minute + time.Second) // > 5 min
	if s.isSessionLocked(state) {
		t.Fatal("session should auto-unlock after 5 minutes")
	}
	if state.lockedAt != nil {
		t.Fatal("auto-unlock should clear lockedAt to nil")
	}
}

func TestSessionLock_BoundaryExactly5Min(t *testing.T) {
	clk := &fakeClock{now: time.Unix(1_000_000, 0)}
	s := newTestRmhbot(clk)
	lockedAt := clk.now
	state := &conversationState{lockedAt: &lockedAt}

	clk.advance(5 * time.Minute) // exactly 5 min: TS uses ">" so still locked
	if !s.isSessionLocked(state) {
		t.Fatal("exactly 5min should still be locked (strict >)")
	}
}

// makeBranchName should be deterministic under the injected clock and sanitized.
func TestMakeBranchName(t *testing.T) {
	clk := &fakeClock{now: time.Unix(1_700_000_000, 0)}
	s := newTestRmhbot(clk)
	got := s.makeBranchName("Cool User!!")
	want := "rmhbot-cool-user-1700000000"
	if got != want {
		t.Errorf("makeBranchName = %q, want %q", got, want)
	}
}
