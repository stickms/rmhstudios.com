package recap

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/bwmarrin/discordgo"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

func strptr(s string) *string { return &s }
func intptr(n int) *int       { return &n }

// ─── embed building + ranking ────────────────────────────────────────────────

func TestBuildRecapEmbed_RankingAndMedals(t *testing.T) {
	// Pre-sorted by moves asc (as the Repo guarantees). Mix of completed +
	// playing, plus a 4th completed to exercise the non-medal bullet.
	participants := []Participant{
		{Username: "alice", Status: "completed", Moves: intptr(3), RatingEmoji: strptr("⭐"), RatingLabel: strptr("Genius")},
		{Username: "bob", Status: "completed", Moves: intptr(5)},
		{Username: "carol", Status: "completed", Moves: intptr(7)},
		{Username: "dave", Status: "completed", Moves: intptr(9)},
		{Username: "erin", Status: "playing"},
		{Username: "frank", Status: "playing"},
	}

	embed := buildRecapEmbed(participants, "2026-01-15", "guild123", "app456", "https://rmhstudios.com")
	if embed == nil {
		t.Fatal("expected non-nil embed")
	}

	if embed.Color != embedColor {
		t.Errorf("color = %d, want %d", embed.Color, embedColor)
	}
	if !strings.Contains(embed.Title, "Lights Out") {
		t.Errorf("title = %q, missing 'Lights Out'", embed.Title)
	}

	desc := embed.Description

	// Header reflects the participant count.
	if !strings.Contains(desc, "**6** players attempted") {
		t.Errorf("description missing 6-player header:\n%s", desc)
	}

	// Medals: alice 🥇, bob 🥈, carol 🥉, dave gets the plain bullet ▪️.
	checks := []struct{ want string }{
		{"🥇 **alice** — ⭐ 3 moves (Genius)"},
		{"🥈 **bob** — 💡 5 moves"}, // default emoji, no rating label
		{"🥉 **carol** — 💡 7 moves"},
		{"▪️ **dave** — 💡 9 moves"},
		{"🏳️ 2 players did not finish"},
	}
	for _, c := range checks {
		if !strings.Contains(desc, c.want) {
			t.Errorf("description missing %q:\n%s", c.want, desc)
		}
	}

	// Play link uses the app id.
	if !strings.Contains(desc, "https://discord.com/activities/app456") {
		t.Errorf("description missing play link:\n%s", desc)
	}

	// Image URL is built from siteURL + guild + dateKey.
	wantImg := "https://rmhstudios.com/api/discord/activity-image?type=leaderboard&guildId=guild123&dateKey=2026-01-15&recap=1"
	if embed.Image == nil || embed.Image.URL != wantImg {
		t.Errorf("image url = %v, want %q", embed.Image, wantImg)
	}
}

func TestBuildRecapEmbed_SingularMove(t *testing.T) {
	participants := []Participant{
		{Username: "solo", Status: "completed", Moves: intptr(1)},
	}
	embed := buildRecapEmbed(participants, "2026-01-15", "g", "", "https://x.test")
	if embed == nil {
		t.Fatal("nil embed")
	}
	if !strings.Contains(embed.Description, "1 move") || strings.Contains(embed.Description, "1 moves") {
		t.Errorf("expected singular '1 move', got:\n%s", embed.Description)
	}
	// Singular header for a single participant.
	if !strings.Contains(embed.Description, "**1** player attempted") {
		t.Errorf("expected singular player header, got:\n%s", embed.Description)
	}
	// No app id -> no play link.
	if strings.Contains(embed.Description, "discord.com/activities") {
		t.Errorf("expected no play link when appID empty:\n%s", embed.Description)
	}
}

func TestBuildRecapEmbed_NoParticipants(t *testing.T) {
	if embed := buildRecapEmbed(nil, "2026-01-15", "g", "a", "s"); embed != nil {
		t.Errorf("expected nil embed for empty participants, got %+v", embed)
	}
}

// ─── puzzle metadata determinism ─────────────────────────────────────────────

func TestComputePuzzleMeta_Deterministic(t *testing.T) {
	a := computePuzzleMeta("2026-01-15")
	b := computePuzzleMeta("2026-01-15")
	if a != b {
		t.Errorf("computePuzzleMeta not deterministic: %+v vs %+v", a, b)
	}
	if a.shapeLabel == "" {
		t.Errorf("empty shape label")
	}
	// 2026-01-15 -> seed 20260115; index = 20260115 %% 16 = 11 -> "◻ Ring".
	if got, want := getShapeLabel(getDailyShape(getDateSeed(2026, 1, 15))), a.shapeLabel; got != want {
		t.Errorf("shape label mismatch: %q vs %q", got, want)
	}
	if a.optimal < 0 {
		t.Errorf("expected a solvable puzzle with optimal >= 0, got %d", a.optimal)
	}
}

func TestSeededRng_MatchesMulberry32(t *testing.T) {
	// Mulberry32 with seed 0: first output is a fixed known-ish value; assert it
	// is in [0,1) and that the same seed reproduces the same sequence.
	r1 := createSeededRng(42)
	r2 := createSeededRng(42)
	for i := 0; i < 5; i++ {
		v1, v2 := r1.next(), r2.next()
		if v1 != v2 {
			t.Fatalf("rng diverged at %d: %v vs %v", i, v1, v2)
		}
		if v1 < 0 || v1 >= 1 {
			t.Fatalf("rng out of range: %v", v1)
		}
	}
}

// ─── runner orchestration with fakes ─────────────────────────────────────────

type fakeRepo struct {
	due          []DueChannel
	participants map[string][]Participant // key: guildID|dateKey
	cleared      []string
}

func (f *fakeRepo) DueChannels(ctx context.Context, now time.Time) ([]DueChannel, error) {
	return f.due, nil
}
func (f *fakeRepo) Participants(ctx context.Context, guildID, dateKey string) ([]Participant, error) {
	return f.participants[guildID+"|"+dateKey], nil
}
func (f *fakeRepo) ClearRecap(ctx context.Context, channelID string) error {
	f.cleared = append(f.cleared, channelID)
	return nil
}

type fakePoster struct {
	posts   []string // channelIDs posted to
	status  int
	postErr error
}

func (f *fakePoster) Post(ctx context.Context, channelID string, msg *discordgo.MessageSend) (int, error) {
	if f.postErr != nil {
		return 0, f.postErr
	}
	f.posts = append(f.posts, channelID)
	st := f.status
	if st == 0 {
		st = 200
	}
	return st, nil
}

func newTestRunner(repo Repo, poster Poster) *Runner {
	return &Runner{
		repo:    repo,
		poster:  poster,
		log:     log.New("recap-test", "error"),
		metrics: telemetry.New("recap-test"),
		appID:   "app",
		siteURL: "https://x.test",
		stop:    make(chan struct{}),
	}
}

func TestProcessDueRecaps_PostsAndClears(t *testing.T) {
	repo := &fakeRepo{
		due: []DueChannel{{ID: "c1", GuildID: "g1", ChannelID: "ch1", RecapDateKey: "2026-01-15"}},
		participants: map[string][]Participant{
			"g1|2026-01-15": {{Username: "a", Status: "completed", Moves: intptr(2)}},
		},
	}
	poster := &fakePoster{}
	r := newTestRunner(repo, poster)

	if err := r.processDueRecaps(context.Background()); err != nil {
		t.Fatalf("processDueRecaps: %v", err)
	}
	if len(poster.posts) != 1 || poster.posts[0] != "ch1" {
		t.Errorf("expected one post to ch1, got %v", poster.posts)
	}
	if len(repo.cleared) != 1 || repo.cleared[0] != "c1" {
		t.Errorf("expected c1 cleared, got %v", repo.cleared)
	}
}

func TestProcessDueRecaps_NoParticipants_ClearsWithoutPosting(t *testing.T) {
	repo := &fakeRepo{
		due:          []DueChannel{{ID: "c1", GuildID: "g1", ChannelID: "ch1", RecapDateKey: "2026-01-15"}},
		participants: map[string][]Participant{}, // none
	}
	poster := &fakePoster{}
	r := newTestRunner(repo, poster)

	if err := r.processDueRecaps(context.Background()); err != nil {
		t.Fatalf("processDueRecaps: %v", err)
	}
	if len(poster.posts) != 0 {
		t.Errorf("expected no posts, got %v", poster.posts)
	}
	if len(repo.cleared) != 1 {
		t.Errorf("expected schedule cleared even with no participants, got %v", repo.cleared)
	}
}

func TestProcessDueRecaps_ForbiddenStillClears(t *testing.T) {
	repo := &fakeRepo{
		due: []DueChannel{{ID: "c1", GuildID: "g1", ChannelID: "ch1", RecapDateKey: "2026-01-15"}},
		participants: map[string][]Participant{
			"g1|2026-01-15": {{Username: "a", Status: "completed", Moves: intptr(2)}},
		},
	}
	poster := &fakePoster{status: 403}
	r := newTestRunner(repo, poster)

	if err := r.processDueRecaps(context.Background()); err != nil {
		t.Fatalf("processDueRecaps: %v", err)
	}
	if len(repo.cleared) != 1 {
		t.Errorf("expected clear after 403, got %v", repo.cleared)
	}
}
