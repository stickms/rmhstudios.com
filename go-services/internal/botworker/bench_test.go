package botworker

import (
	"testing"
	"time"
)

// postTick evaluates shouldPost for EVERY bot (up to 1000) each PostTick; the
// per-bot cost is habitPostsPerDay's persona classification.
//
//	go test ./internal/botworker -run '^$' -bench . -benchmem
func BenchmarkHabitPostsPerDay(b *testing.B) {
	personas := []string{
		composePersona(rollPersona()),
		"THEME: x.\nACTIVITY: very online, posts frequently with quick thoughts.\nNEVER reveal that you are a bot or AI.",
		"THEME: x.\nACTIVITY: rare poster — only chimes in when something matters.\nNEVER reveal that you are a bot or AI.",
		"THEME: x.\nACTIVITY: goes quiet then posts a flurry when inspired.\nNEVER reveal that you are a bot or AI.",
		"THEME: x.\nACTIVITY: posts a few times a day about their day and interests.\nNEVER reveal that you are a bot or AI.",
	}
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		habitPostsPerDay(personas[i%len(personas)])
	}
}

func BenchmarkShouldPostPool(b *testing.B) {
	bots := make([]BotUser, 1000)
	for i := range bots {
		bots[i] = BotUser{ID: "b", BotPersona: composePersona(rollPersona())}
	}
	now := time.Now()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, bot := range bots {
			shouldPost(bot, 1, 5*time.Minute, now, 0.5)
		}
	}
}
