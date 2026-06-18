package rmhbox

import "fmt"

// MinigameDef is the static metadata for a registered minigame (the relevant
// subset of the client-side MINIGAME_REGISTRY entry).
type MinigameDef struct {
	ID                   string
	DisplayName          string
	Description          string
	MinPlayers           int
	MaxPlayers           int
	InstructionSeconds   int
	EstimatedSeconds     int
	JoinInProgressPolicy string // "spectate_only" | "join_next_subround" | "join_immediately"
}

// minigameRegistry mirrors lib/rmhbox/minigame-registry.ts (the 9 active games).
var minigameRegistry = map[string]MinigameDef{
	"rhyme-time":             {ID: "rhyme-time", DisplayName: "Rhyme Time", Description: "Find as many rhymes as you can.", MinPlayers: 2, MaxPlayers: 16, InstructionSeconds: 15, EstimatedSeconds: 180, JoinInProgressPolicy: "spectate_only"},
	"undercover-agent":       {ID: "undercover-agent", DisplayName: "Undercover Agent", MinPlayers: 4, MaxPlayers: 16, JoinInProgressPolicy: "spectate_only"},
	"category-crash":         {ID: "category-crash", DisplayName: "Category Crash", MinPlayers: 3, MaxPlayers: 16, JoinInProgressPolicy: "join_next_subround"},
	"wiki-race":              {ID: "wiki-race", DisplayName: "Wiki-Race", MinPlayers: 2, MaxPlayers: 10, JoinInProgressPolicy: "spectate_only"},
	"wit-war":                {ID: "wit-war", DisplayName: "Wit-War", MinPlayers: 3, MaxPlayers: 16, JoinInProgressPolicy: "spectate_only"},
	"fact-or-friction":       {ID: "fact-or-friction", DisplayName: "Fact or Friction", MinPlayers: 2, MaxPlayers: 16, JoinInProgressPolicy: "join_next_subround"},
	"undercover-editor":      {ID: "undercover-editor", DisplayName: "Undercover Editor", MinPlayers: 4, MaxPlayers: 10, JoinInProgressPolicy: "spectate_only"},
	"minimalist-masterpiece": {ID: "minimalist-masterpiece", DisplayName: "Minimalist Masterpiece", MinPlayers: 3, MaxPlayers: 12, JoinInProgressPolicy: "spectate_only"},
	"emoji-cinema":           {ID: "emoji-cinema", DisplayName: "Emoji Cinema", MinPlayers: 3, MaxPlayers: 12, JoinInProgressPolicy: "join_next_subround"},
}

func getMinigameDef(id string) (MinigameDef, bool) {
	d, ok := minigameRegistry[id]
	return d, ok
}

// minigameFactory builds a server-side handler instance for a minigameId.
type minigameFactory func(ctx *MinigameContext) Minigame

// serverRegistry maps minigameId -> handler constructor. Mirrors
// MINIGAME_SERVER_REGISTRY in game-coordinator.ts.
//
// One representative game (rhyme-time) is ported FULLY. The remaining eight are
// registered as compiling stubs (see minigames.go) so that startGameFlow can
// look them up and the migration is clearly tracked.
var serverRegistry = map[string]minigameFactory{
	"rhyme-time": func(ctx *MinigameContext) Minigame { return newRhymeTimeGame(ctx) },

	// TODO(migration): port these eight handlers from server/rmhbox/minigames/*.
	// Each currently returns a stub that auto-completes with zero scores so the
	// lobby lifecycle remains exercisable end-to-end.
	"undercover-agent":       newStubFactory("undercover-agent", SpectatorShared),
	"category-crash":         newStubFactory("category-crash", SpectatorCompetitive),
	"wiki-race":              newStubFactory("wiki-race", SpectatorCompetitive),
	"wit-war":                newStubFactory("wit-war", SpectatorShared),
	"fact-or-friction":       newStubFactory("fact-or-friction", SpectatorShared),
	"undercover-editor":      newStubFactory("undercover-editor", SpectatorShared),
	"minimalist-masterpiece": newStubFactory("minimalist-masterpiece", SpectatorShared),
	"emoji-cinema":           newStubFactory("emoji-cinema", SpectatorShared),
}

func errFromRecover(r any) error {
	if err, ok := r.(error); ok {
		return err
	}
	return fmt.Errorf("%v", r)
}
