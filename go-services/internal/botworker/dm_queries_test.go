package botworker

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/log"
	"github.com/rmhstudios/rmh-go/pkg/telemetry"
)

// dmCountingRepo implements only what answerDirectMessages touches before it
// reaches the model; any other call panics on the nil embedded Repo, which is
// itself the assertion that the pass makes no further queries.
type dmCountingRepo struct {
	Repo
	convos  []ConversationRow
	queries int
}

func (r *dmCountingRepo) RecentBotConversations(context.Context, time.Time) ([]ConversationRow, error) {
	r.queries++
	return r.convos, nil
}

// The DM tick runs every minute. It used to issue one extra statement per
// recent bot conversation (up to 60) just to learn who spoke last; that sender
// now arrives on the conversations query, so the whole candidate scan is ONE
// statement however many conversations there are.
func TestAnswerDirectMessagesScanIsOneQuery(t *testing.T) {
	repo := &dmCountingRepo{}
	for i := 0; i < 60; i++ {
		repo.convos = append(repo.convos, ConversationRow{
			ID: "c", ParticipantOneID: "bot", ParticipantTwoID: "human",
			OneIsBot: true, TwoIsBot: false, LastSenderID: "human",
		})
	}
	cfg := LoadConfig()
	cfg.ReactiveDMProb = 0 // find candidates, answer none: no model call
	w := newWithDeps(repo, nil, log.New("bot-worker", "error"), telemetry.New("bot-worker"), cfg)
	w.answerDirectMessages(context.Background())
	if repo.queries != 1 {
		t.Fatalf("answerDirectMessages issued %d queries for 60 conversations, want 1", repo.queries)
	}
}

func TestRecentBotConversationsQueryCarriesLastSender(t *testing.T) {
	for _, want := range []string{`LEFT JOIN LATERAL`, `"direct_message"`, `ORDER BY dm."createdAt" DESC LIMIT 1`, `last_sender_id`} {
		if !strings.Contains(recentBotConversationsQuery, want) {
			t.Errorf("query missing %q", want)
		}
	}
}
