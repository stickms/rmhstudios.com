package botworker

import (
	"strings"
	"testing"
)

// The "never reveal you are a bot" rule applies to replies and DMs too. These
// tests assert the system prompts forbid disclosure and the user-context
// assembly never injects disclosure language.

func TestReplySystemPromptForbidsDisclosure(t *testing.T) {
	sys := replySystemPrompt("THEME: coffee\nVOICE: wry")
	low := strings.ToLower(sys)
	if !strings.Contains(low, "never reveal") || !strings.Contains(low, "ai") {
		t.Errorf("reply system prompt missing never-reveal rule: %q", sys)
	}
}

func TestDMSystemPromptForbidsDisclosure(t *testing.T) {
	sys := dmSystemPrompt("THEME: coffee\nVOICE: wry")
	low := strings.ToLower(sys)
	if !strings.Contains(low, "never reveal") {
		t.Errorf("dm system prompt missing never-reveal rule: %q", sys)
	}
}

func TestReplyContextAssemblyNoDisclosure(t *testing.T) {
	got := assembleReplyContext("a great post", "the quoted thing", []string{"first comment", "second comment"})
	for _, banned := range []string{"as an ai", "i am a bot", "language model", "chatbot"} {
		if strings.Contains(strings.ToLower(got), banned) {
			t.Fatalf("reply context leaked disclosure %q: %q", banned, got)
		}
	}
	// Context must include the post and thread.
	for _, want := range []string{"a great post", "the quoted thing", "first comment", "second comment"} {
		if !strings.Contains(got, want) {
			t.Errorf("reply context missing %q: %q", want, got)
		}
	}
}

func TestDMTranscriptAssembly(t *testing.T) {
	turns := []dmTurn{
		{From: "them", Text: "hey"},
		{From: "you", Text: "hi back"},
	}
	got := assembleDMTranscript(turns)
	if !strings.Contains(got, "Them: hey") || !strings.Contains(got, "You: hi back") {
		t.Errorf("dm transcript wrong: %q", got)
	}
	for _, banned := range []string{"as an ai", "i am a bot", "language model"} {
		if strings.Contains(strings.ToLower(got), banned) {
			t.Fatalf("dm transcript leaked disclosure %q: %q", banned, got)
		}
	}
}
