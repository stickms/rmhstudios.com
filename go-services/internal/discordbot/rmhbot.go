// rmhbot.go is the SCAFFOLDED port of the /rmhbot agentic website editor
// (server/discord-bot/command-handler.ts + conversation.ts + git-ops.ts +
// commands/*.ts). This is the acknowledged partial-scope piece.
//
// What is REAL / faithful here:
//   - The command + interaction structure (/rmhbot, /rmhbot-continue,
//     /rmhbot-push, plus the rmhbot_continue / rmhbot_push buttons & modal).
//   - The in-memory session model (branch, worktree path, message history,
//     deletedFilesThisSession, lockedAt) keyed by discord userId.
//   - The 5-minute auto-unlock logic, driven by an injectable clock (so it is
//     unit-testable) — ported from conversation.ts isSessionLocked().
//   - safePath path-traversal guard — ported from command-handler.ts safePath().
//   - The git operations SHAPE via os/exec (init/fetch/checkout-b, add, commit,
//     push) — ported from git-ops.ts.
//   - The agentic tool LOOP skeleton: MAX_TOOL_ROUNDS=40, DeepSeek round, tool
//     dispatch switch, history round-tripping, result truncation.
//
// What is STUBBED (clearly marked // TODO(migration): ... — returns sensible
// errors / placeholders, always compiles):
//   - The individual edit tools' real filesystem work beyond read/list (write,
//     delete) is implemented; run_typecheck and the PR-open + GitHub API steps
//     are stubs because they depend on the JS toolchain / a real GITHUB_TOKEN
//     environment not modelled in this service.
//   - Live progress-reporter streaming (the TS ProgressReporter) is reduced to
//     a single working embed + final embed.
//   - Attachment (image/text) ingestion is omitted.
package discordbot

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

// Limits ported from command-handler.ts.
const (
	maxToolRounds    = 40
	maxToolResultLen = 8000
	maxFileSizeBytes = 10 * 1024 * 1024
	sessionLockTTL   = 5 * time.Minute
)

// GitHub repo coordinates (git-ops.ts). These are the defaults used when the
// GITHUB_REPO env var ("owner/name") is unset, preserving the original behavior.
const (
	defaultRepoOwner = "stickms"
	defaultRepoName  = "rmhstudios.com"
)

// resolveRepo parses GITHUB_REPO ("owner/name") and returns the owner/name to
// use, falling back to the defaults when the env is unset or malformed. Keeping
// it pure makes it trivially testable.
func resolveRepo() (owner, name string) {
	owner, name = defaultRepoOwner, defaultRepoName
	if v := os.Getenv("GITHUB_REPO"); v != "" {
		if o, n, ok := strings.Cut(v, "/"); ok && o != "" && n != "" {
			owner, name = o, n
		}
	}
	return owner, name
}

// rmhbotSystemPrompt is copied verbatim from deepseek.ts SYSTEM_PROMPT.
const rmhbotSystemPrompt = `You are RMHBot, an AI code editor with direct write access to the rmhstudios.com repository.
You may read any file and write changes to implement the user's request.

HARD LIMITS — never do these, even if asked:
- Do not modify files in: server/discord-bot/, .env, .env.*
- Do not delete more than 10 files in a single session.
- Do not remove or bypass authentication middleware.
- Do not introduce new npm dependencies without explicit user approval.
- Do not write code that exfiltrates environment variables or makes outbound requests to non-rmhstudios domains (except established third-party APIs already in the codebase).

WORKFLOW:
1. Start by reading relevant files to understand the current implementation.
2. Make targeted, minimal changes to satisfy the request.
3. Always run run_typecheck after writing files.
4. Fix any type errors before stopping.
5. Provide a concise summary of what you changed and why.`

// Clock is injectable so the 5-minute auto-unlock is testable. Production uses
// realClock (time.Now); tests use a fake.
type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// conversationState mirrors conversation.ts ConversationState.
type conversationState struct {
	branchName              string
	worktreePath            string
	discordUserID           string
	discordUsername         string
	channelID               string
	history                 []ChatMessage
	deletedFilesThisSession []string
	lockedAt                *time.Time // nil == unlocked

	// mu serializes the check-and-lock decision plus all history/lockedAt
	// mutation for THIS session, closing the TOCTOU window where two concurrent
	// interactions from the same user could both pass the lock check (s.mu only
	// guards the sessions map, not per-session state).
	mu sync.Mutex
}

// RmhbotService owns the agentic editor sessions.
type RmhbotService struct {
	deepseek     *DeepSeekClient
	logger       *log.Logger
	clock        Clock
	worktreesDir string
	githubToken  string
	repoOwner    string // from GITHUB_REPO ("owner/name"), else defaultRepoOwner
	repoName     string // from GITHUB_REPO ("owner/name"), else defaultRepoName

	mu       sync.Mutex
	sessions map[string]*conversationState // keyed by discord userId
}

// NewRmhbotService wires the editor. worktreesDir is where clones land
// (RMHBOT_WORKTREES_DIR); githubToken authenticates fetch/push/PR.
func NewRmhbotService(deepseek *DeepSeekClient, logger *log.Logger, worktreesDir, githubToken string) *RmhbotService {
	if worktreesDir == "" {
		worktreesDir = filepath.Join(os.TempDir(), "rmhbot-worktrees")
	}
	owner, name := resolveRepo()
	return &RmhbotService{
		deepseek:     deepseek,
		logger:       logger,
		clock:        realClock{},
		worktreesDir: worktreesDir,
		githubToken:  githubToken,
		repoOwner:    owner,
		repoName:     name,
		sessions:     make(map[string]*conversationState),
	}
}

// ─── Path / branch helpers (ported from command-handler.ts + conversation.ts) ─

var (
	nonBranchChars = regexp.MustCompile(`[^a-z0-9-]`)
	dashRuns       = regexp.MustCompile(`-+`)
	edgeDashes     = regexp.MustCompile(`^-|-$`)
	leadingSlashes = regexp.MustCompile(`^[/\\]+`)
)

// sanitizeUsername mirrors conversation.ts sanitizeUsername.
func sanitizeUsername(username string) string {
	s := strings.ToLower(username)
	s = nonBranchChars.ReplaceAllString(s, "-")
	s = dashRuns.ReplaceAllString(s, "-")
	s = edgeDashes.ReplaceAllString(s, "")
	if s == "" {
		return "user"
	}
	return s
}

// makeBranchName mirrors conversation.ts makeBranchName.
func (s *RmhbotService) makeBranchName(username string) string {
	return fmt.Sprintf("rmhbot-%s-%d", sanitizeUsername(username), s.clock.Now().Unix())
}

// safePath is the path-traversal guard, ported 1:1 from command-handler.ts.
// It strips leading slashes, resolves against basePath, and rejects any result
// that escapes basePath. Exported-style behaviour is kept package-private; the
// test calls it directly.
func safePath(basePath, userPath string) (string, error) {
	normalized := leadingSlashes.ReplaceAllString(userPath, "")
	full := filepath.Clean(filepath.Join(basePath, normalized))
	base := filepath.Clean(basePath)
	if full != base && !strings.HasPrefix(full, base+string(filepath.Separator)) {
		return "", fmt.Errorf("Path traversal detected: %s", userPath)
	}
	return full, nil
}

// ─── Session locking (ported from conversation.ts isSessionLocked) ──────────

// isSessionLockedLocked reports whether the session is locked, auto-unlocking
// after sessionLockTTL (assumes a crashed previous run). Uses the injectable
// clock and mutates state.lockedAt to nil on auto-unlock, matching the TS.
// CALLER MUST HOLD state.mu (hence the "Locked" suffix).
func (s *RmhbotService) isSessionLockedLocked(state *conversationState) bool {
	if state.lockedAt == nil {
		return false
	}
	if s.clock.Now().Sub(*state.lockedAt) > sessionLockTTL {
		state.lockedAt = nil
		return false
	}
	return true
}

// tryLock performs the check-and-lock as a single critical section under
// state.mu, closing the TOCTOU window where two concurrent interactions from the
// same user could both pass an unsynchronized lock check. It returns false (and
// leaves the existing lock intact) when the session is already locked; otherwise
// it sets lockedAt to now and returns true. The caller must call unlock when the
// work completes.
func (s *RmhbotService) tryLock(state *conversationState) bool {
	state.mu.Lock()
	defer state.mu.Unlock()
	if s.isSessionLockedLocked(state) {
		return false
	}
	now := s.clock.Now()
	state.lockedAt = &now
	return true
}

// unlock releases the per-session lock under state.mu.
func (s *RmhbotService) unlock(state *conversationState) {
	state.mu.Lock()
	state.lockedAt = nil
	state.mu.Unlock()
}

// isSessionLocked is the lock-acquiring wrapper around isSessionLockedLocked. It
// preserves the original auto-unlock semantics for direct/standalone callers
// (and the unit tests) that don't already hold state.mu.
func (s *RmhbotService) isSessionLocked(state *conversationState) bool {
	state.mu.Lock()
	defer state.mu.Unlock()
	return s.isSessionLockedLocked(state)
}

func (s *RmhbotService) getSession(userID string) (*conversationState, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.sessions[userID]
	return st, ok
}

func (s *RmhbotService) setSession(state *conversationState) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[state.discordUserID] = state
}

func (s *RmhbotService) deleteSession(userID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, userID)
}

// ─── git ops (shape ported from git-ops.ts via os/exec) ─────────────────────

// gitConfigArgs mirrors git-ops.ts gitConfigArgs (safe.directory + token rewrite).
func (s *RmhbotService) gitConfigArgs() []string {
	args := []string{"-c", "safe.directory=*"}
	if s.githubToken != "" {
		args = append(args, "-c",
			fmt.Sprintf("url.https://x-access-token:%s@github.com/.insteadOf=https://github.com/", s.githubToken))
	}
	return args
}

// git runs a git subcommand in cwd, returning trimmed stdout.
func (s *RmhbotService) git(ctx context.Context, cwd string, args ...string) (string, error) {
	full := append(s.gitConfigArgs(), args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, string(out))
	}
	return strings.TrimSpace(string(out)), nil
}

// createWorktree mirrors git-ops.ts createWorktree: a fresh shallow clone of
// main in a container-owned dir, then checkout -b the session branch. REAL.
func (s *RmhbotService) createWorktree(ctx context.Context, branchName string) (string, error) {
	if err := os.MkdirAll(s.worktreesDir, 0o755); err != nil {
		return "", fmt.Errorf("mkdir worktrees dir: %w", err)
	}
	clonePath := filepath.Join(s.worktreesDir, strings.NewReplacer("/", "_", "\\", "_").Replace(branchName))
	_ = os.RemoveAll(clonePath) // clean up any stale clone
	if err := os.MkdirAll(clonePath, 0o755); err != nil {
		return "", fmt.Errorf("mkdir clone path: %w", err)
	}

	remote := fmt.Sprintf("https://github.com/%s/%s.git", s.repoOwner, s.repoName)
	if _, err := s.git(ctx, clonePath, "init"); err != nil {
		return "", err
	}
	if _, err := s.git(ctx, clonePath, "remote", "add", "origin", remote); err != nil {
		return "", err
	}
	if _, err := s.git(ctx, clonePath, "fetch", "--depth=1", "origin", "main"); err != nil {
		return "", err
	}
	if _, err := s.git(ctx, clonePath, "checkout", "-b", branchName, "FETCH_HEAD"); err != nil {
		return "", err
	}
	return clonePath, nil
}

func (s *RmhbotService) removeWorktree(clonePath string) {
	_ = os.RemoveAll(clonePath)
}

// stageAll / commit / pushBranch / hasUncommittedChanges — REAL git shape.
func (s *RmhbotService) stageAll(ctx context.Context, cwd string) error {
	_, err := s.git(ctx, cwd, "add", "-A")
	return err
}

func (s *RmhbotService) commit(ctx context.Context, cwd, message, authorName, authorEmail string) (string, error) {
	full := message + "\n\nCo-Authored-By: RMHBot <rmhbot@rmhstudios.com>"
	if _, err := s.git(ctx, cwd,
		"-c", "user.name="+authorName,
		"-c", "user.email="+authorEmail,
		"commit", "-m", full); err != nil {
		return "", err
	}
	return s.git(ctx, cwd, "rev-parse", "--short", "HEAD")
}

func (s *RmhbotService) pushBranch(ctx context.Context, cwd, branchName string) error {
	_, err := s.git(ctx, cwd, "push", "origin", branchName, "--force-with-lease")
	return err
}

func (s *RmhbotService) hasUncommittedChanges(ctx context.Context, cwd string) (bool, error) {
	status, err := s.git(ctx, cwd, "status", "--porcelain")
	if err != nil {
		return false, err
	}
	return len(status) > 0, nil
}

func (s *RmhbotService) getLastCommitMessage(ctx context.Context, cwd string) (string, error) {
	return s.git(ctx, cwd, "log", "-1", "--pretty=%s")
}

// runTypecheck is STUBBED. The TS version shells out to the project's tsc with
// the JS toolchain present in the container. That toolchain is not part of this
// Go service, so we return a sensible "not implemented" result rather than
// pretending the check passed.
func (s *RmhbotService) runTypecheck(_ context.Context, _ string) (success bool, output string) {
	// TODO(migration): port git-ops.ts runTypecheck — needs node + the repo's
	// tsconfig.server.json + node_modules wired into the clone. Until then we
	// fail closed so callers don't open PRs on unchecked code.
	return false, "run_typecheck not implemented in the Go port (TODO migration)"
}

// createPullRequest is STUBBED. Shape mirrors git-ops.ts createPullRequest
// (GitHub REST POST /repos/{owner}/{repo}/pulls) but is left as a TODO.
func (s *RmhbotService) createPullRequest(_ context.Context, _, _, _ string) (string, error) {
	// TODO(migration): port git-ops.ts createPullRequest — stdlib net/http POST
	// to https://api.github.com/repos/<owner>/<repo>/pulls with the GITHUB_TOKEN
	// bearer, {title, body, head: branch, base: "main"}, returning html_url.
	return "", fmt.Errorf("createPullRequest not implemented in the Go port (TODO migration)")
}

// ─── safety guards (ported from safety.ts) ──────────────────────────────────

var (
	protectedPaths    = []string{".env", "server/discord-bot"}
	protectedPrefixes = []string{"server/discord-bot/", ".env."}
	secretPatterns    = []*regexp.Regexp{
		regexp.MustCompile(`DEEPSEEK_API_KEY\s*=\s*\S+`),
		regexp.MustCompile(`DISCORD_.*TOKEN\s*=\s*\S+`),
		regexp.MustCompile(`GITHUB_TOKEN\s*=\s*\S+`),
		regexp.MustCompile(`BETTER_AUTH_SECRET\s*=\s*\S+`),
		regexp.MustCompile(`TOKEN_ENCRYPTION_KEY\s*=\s*\S+`),
	}
	normalizeLead = regexp.MustCompile(`^[./\\]+`)
)

func normalizeSafetyPath(p string) string {
	p = normalizeLead.ReplaceAllString(p, "")
	return strings.ReplaceAll(p, "\\", "/")
}

func isProtectedPath(p string) bool {
	n := normalizeSafetyPath(p)
	for _, pp := range protectedPaths {
		if n == pp {
			return true
		}
	}
	for _, pre := range protectedPrefixes {
		if strings.HasPrefix(n, pre) {
			return true
		}
	}
	return false
}

func checkWriteSafety(p, content string) (bool, string) {
	if isProtectedPath(p) {
		return false, fmt.Sprintf("`%s` is a protected path and cannot be modified.", p)
	}
	for _, pat := range secretPatterns {
		if pat.MatchString(content) {
			return false, fmt.Sprintf("Write blocked: content matches secret pattern `%s`.", pat.String())
		}
	}
	return true, ""
}

func checkDeleteSafety(p string, deletedThisSession []string) (bool, string) {
	if isProtectedPath(p) {
		return false, fmt.Sprintf("`%s` is a protected path and cannot be deleted.", p)
	}
	if len(deletedThisSession) >= 10 {
		return false, "Bulk-delete limit reached (10 files per session)."
	}
	return true, ""
}

// ─── tool definitions (ported from deepseek.ts TOOLS) ───────────────────────

func rmhbotTools() []Tool {
	objType := func(props map[string]any, required []string) map[string]any {
		return map[string]any{"type": "object", "properties": props, "required": required}
	}
	strProp := func(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
	return []Tool{
		{Type: "function", Function: ToolFunction{Name: "read_file", Description: "Read the contents of a file in the repository.",
			Parameters: objType(map[string]any{"path": strProp("Relative path from repo root")}, []string{"path"})}},
		{Type: "function", Function: ToolFunction{Name: "list_directory", Description: "List files in a directory.",
			Parameters: objType(map[string]any{"path": strProp("Relative path from repo root"),
				"recursive": map[string]any{"type": "boolean", "description": "List recursively (default false)"}}, []string{"path"})}},
		{Type: "function", Function: ToolFunction{Name: "write_file", Description: "Write or overwrite a file in the repository.",
			Parameters: objType(map[string]any{"path": strProp("Relative path from repo root"),
				"content": strProp("Full file contents to write")}, []string{"path", "content"})}},
		{Type: "function", Function: ToolFunction{Name: "delete_file", Description: "Delete a file from the repository.",
			Parameters: objType(map[string]any{"path": strProp("Relative path from repo root")}, []string{"path"})}},
		{Type: "function", Function: ToolFunction{Name: "run_typecheck", Description: "Run TypeScript type checking. Always run before finalizing.",
			Parameters: objType(map[string]any{}, []string{})}},
		{Type: "function", Function: ToolFunction{Name: "search_code", Description: "Search for code patterns across the repository using grep.",
			Parameters: objType(map[string]any{"query": strProp("Search string or regex pattern"),
				"glob": strProp("File glob to restrict search")}, []string{"query"})}},
	}
}

// executeTool dispatches one tool call. read/list/write/delete/search are REAL
// (with the safePath + safety guards); run_typecheck is the stub above.
func (s *RmhbotService) executeTool(ctx context.Context, name string, args map[string]any, state *conversationState, changedFiles *[]string) string {
	wt := state.worktreePath
	argStr := func(k string) string {
		if v, ok := args[k].(string); ok {
			return v
		}
		return ""
	}

	switch name {
	case "read_file":
		fp, err := safePath(wt, argStr("path"))
		if err != nil {
			return "Error: " + err.Error()
		}
		info, err := os.Stat(fp)
		if err != nil {
			return "Error: " + err.Error()
		}
		if info.Size() > maxFileSizeBytes {
			return fmt.Sprintf("File too large (%dKB).", info.Size()/1024)
		}
		data, err := os.ReadFile(fp)
		if err != nil {
			return "Error: " + err.Error()
		}
		return string(data)

	case "list_directory":
		fp, err := safePath(wt, argStr("path"))
		if err != nil {
			return "Error: " + err.Error()
		}
		entries, err := os.ReadDir(fp)
		if err != nil {
			return "Error: " + err.Error()
		}
		var lines []string
		for _, e := range entries {
			if e.IsDir() {
				lines = append(lines, e.Name()+"/")
			} else {
				lines = append(lines, e.Name())
			}
		}
		if len(lines) == 0 {
			return "(empty)"
		}
		// TODO(migration): the TS list_directory supported a `recursive` flag via
		// `find` with node_modules/.git/dist-server/.output exclusions. Recursive
		// listing is not yet ported.
		return strings.Join(lines, "\n")

	case "write_file":
		content := argStr("content")
		if ok, reason := checkWriteSafety(argStr("path"), content); !ok {
			return "Blocked: " + reason
		}
		fp, err := safePath(wt, argStr("path"))
		if err != nil {
			return "Error: " + err.Error()
		}
		if err := os.MkdirAll(filepath.Dir(fp), 0o755); err != nil {
			return "Error: " + err.Error()
		}
		if err := os.WriteFile(fp, []byte(content), 0o644); err != nil {
			return "Error: " + err.Error()
		}
		rel, _ := filepath.Rel(wt, fp)
		appendUnique(changedFiles, rel)
		return "OK"

	case "delete_file":
		if ok, reason := checkDeleteSafety(argStr("path"), state.deletedFilesThisSession); !ok {
			return "Blocked: " + reason
		}
		fp, err := safePath(wt, argStr("path"))
		if err != nil {
			return "Error: " + err.Error()
		}
		if err := os.Remove(fp); err != nil {
			return "Error: " + err.Error()
		}
		state.deletedFilesThisSession = append(state.deletedFilesThisSession, argStr("path"))
		rel, _ := filepath.Rel(wt, fp)
		appendUnique(changedFiles, "(deleted) "+rel)
		return "OK"

	case "run_typecheck":
		ok, out := s.runTypecheck(ctx, wt)
		if ok {
			return strings.TrimSpace("Typecheck passed ✓\n" + out)
		}
		return "Typecheck failed:\n" + out

	case "search_code":
		// TODO(migration): port command-handler.ts search_code — a `grep -r -n`
		// over the clone with node_modules/.git/dist-server/.output excluded and
		// an optional --include glob, capped at 100 lines.
		return "search_code not implemented in the Go port (TODO migration)"

	default:
		return "Unknown tool: " + name
	}
}

func appendUnique(list *[]string, v string) {
	for _, x := range *list {
		if x == v {
			return
		}
	}
	*list = append(*list, v)
}

// ─── agent loop skeleton (ported from command-handler.ts runAgentLoop) ──────

// runAgentLoop drives up to maxToolRounds DeepSeek rounds, dispatching tool
// calls and round-tripping their results into history. Non-streaming.
func (s *RmhbotService) runAgentLoop(ctx context.Context, state *conversationState, request string) (summary string, changedFiles []string, err error) {
	state.history = append(state.history, ChatMessage{Role: roleUser, Content: request})

	for round := 0; round < maxToolRounds; round++ {
		res, callErr := s.deepseek.complete(ctx, state.history, rmhbotTools())
		if callErr != nil {
			return "", changedFiles, callErr
		}

		if len(res.ToolCalls) > 0 {
			// Record the assistant turn with its tool calls.
			state.history = append(state.history, ChatMessage{
				Role:      roleAssistant,
				Content:   res.Content,
				ToolCalls: res.ToolCalls,
			})

			for _, tc := range res.ToolCalls {
				var parsed map[string]any
				argsStr := tc.Function.Arguments
				if argsStr == "" {
					argsStr = "{}"
				}
				result := ""
				if jErr := json.Unmarshal([]byte(argsStr), &parsed); jErr != nil {
					result = "Error: " + jErr.Error()
				} else {
					result = s.executeTool(ctx, tc.Function.Name, parsed, state, &changedFiles)
				}
				if len(result) > maxToolResultLen {
					result = result[:maxToolResultLen] + "\n[truncated]"
				}
				state.history = append(state.history, ChatMessage{
					Role:       roleTool,
					ToolCallID: tc.ID,
					Content:    result,
				})
			}
			continue
		}

		// No tool calls -> final answer.
		summary = res.Content
		state.history = append(state.history, ChatMessage{Role: roleAssistant, Content: res.Content})
		return summary, changedFiles, nil
	}

	return summary, changedFiles, nil
}

// ─── command entrypoints ────────────────────────────────────────────────────

// HandleRmhbotCommand drives /rmhbot (isNew=true), /rmhbot-continue and the
// continue modal (isNew=false). Ported from command-handler.ts handleCommand.
func (s *RmhbotService) HandleRmhbotCommand(ctx context.Context, sess *discordgo.Session, i *discordgo.InteractionCreate, request string, isNew bool) error {
	userID, username := interactionUser(i)
	channelID := i.ChannelID

	state, exists := s.getSession(userID)
	if !isNew && !exists {
		return respondText(sess, i, "No active session — use `/rmhbot` to start one.")
	}
	// For any pre-existing session, acquire the per-session lock as a single
	// check-and-lock critical section (closes the TOCTOU window). This blocks both
	// /rmhbot-continue AND a fresh /rmhbot while prior work is in flight, matching
	// the original `exists && isSessionLocked` guard. For a brand-new session
	// (no prior state) the lock is acquired below, right after the session is
	// created and registered, before any history mutation.
	if exists {
		if !s.tryLock(state) {
			return respondText(sess, i, "Still working on your last request — please wait.")
		}
		// A new command replaces the existing session below, so for isNew we let
		// that fresh session carry its own lock (acquired after setSession) and
		// release this old session's lock now that we've won the race.
		if isNew {
			s.unlock(state)
		} else {
			defer s.unlock(state)
		}
	}

	// Defer — the agent loop is slow.
	if err := sess.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		// For an existing session the lock is released by the deferred unlock
		// above; a new session has not been locked yet at this point.
		return fmt.Errorf("defer reply: %w", err)
	}

	if isNew {
		branchName := s.makeBranchName(username)
		worktreePath, wErr := s.createWorktree(ctx, branchName)
		if wErr != nil {
			return s.editText(sess, i, fmt.Sprintf("❌ Failed to create git worktree: %v", wErr))
		}
		state = &conversationState{
			branchName:      branchName,
			worktreePath:    worktreePath,
			discordUserID:   userID,
			discordUsername: username,
			channelID:       channelID,
			history:         []ChatMessage{{Role: roleSystem, Content: rmhbotSystemPrompt}},
		}
		s.setSession(state)
		// Lock the freshly-registered session before mutating its history. A
		// concurrent /rmhbot from the same user would overwrite this session in
		// the map; locking here keeps THIS interaction's history/lock coherent.
		s.tryLock(state)
		defer s.unlock(state)
	}

	// Initial working embed (ported from handleCommand's initialEmbed).
	working := &discordgo.MessageEmbed{
		Color:       0xf59e0b,
		Title:       "⚙️ Working...",
		Description: fmt.Sprintf("Branch: `%s`", state.branchName),
		Fields: []*discordgo.MessageEmbedField{
			{Name: "📝 Request", Value: truncateHard(request, 1024)},
			{Name: "💭 Thinking", Value: "*Starting...*"},
		},
	}
	_, _ = sess.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Embeds: &[]*discordgo.MessageEmbed{working}})

	summary, changedFiles, loopErr := s.runAgentLoop(ctx, state, request)
	if loopErr != nil {
		s.logger.Error("rmhbot loop", "userId", userID, "error", loopErr)
		return s.editEmbed(sess, i, errorEmbed(state.branchName, loopErr.Error()))
	}

	if len(changedFiles) > 0 {
		if err := s.stageAll(ctx, state.worktreePath); err != nil {
			return s.editEmbed(sess, i, errorEmbed(state.branchName, err.Error()))
		}
		dirty, _ := s.hasUncommittedChanges(ctx, state.worktreePath)
		if dirty {
			sha, cErr := s.commit(ctx, state.worktreePath,
				truncateHard(request, 72), username, fmt.Sprintf("discord-%s@rmhstudios.com", userID))
			if cErr != nil {
				return s.editEmbed(sess, i, errorEmbed(state.branchName, cErr.Error()))
			}
			_ = s.pushBranch(ctx, state.worktreePath, state.branchName) // best-effort, like the TS .catch
			s.logger.Info("rmhbot_done", "userId", userID, "branch", state.branchName, "sha", sha)
			return s.editEmbed(sess, i, s.finalizeEmbed(state, sha, changedFiles, summary))
		}
	}
	return s.editEmbed(sess, i, s.finalizeNoChangesEmbed(state, summary))
}

// HandlePush drives /rmhbot-push and the rmhbot_push button. Ported from
// commands/rmhbot-push.ts handlePush. The typecheck + PR-open steps are stubs.
func (s *RmhbotService) HandlePush(ctx context.Context, sess *discordgo.Session, i *discordgo.InteractionCreate, customTitle string) error {
	userID, _ := interactionUser(i)
	state, ok := s.getSession(userID)
	if !ok {
		return respondText(sess, i, "No active session — use `/rmhbot` to start one.")
	}
	// Acquire the per-session lock as a single check-and-lock critical section so
	// a push can't race a concurrent /rmhbot-continue on the same session.
	if !s.tryLock(state) {
		return respondText(sess, i, "Still working on your last request — please wait.")
	}
	defer s.unlock(state)

	if err := sess.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	}); err != nil {
		return fmt.Errorf("defer reply: %w", err)
	}

	_ = s.editEmbed(sess, i, &discordgo.MessageEmbed{
		Color:       0xf59e0b,
		Title:       "🔍 Checking...",
		Description: fmt.Sprintf("Running typecheck on `%s`...", state.branchName),
	})

	ok, out := s.runTypecheck(ctx, state.worktreePath)
	if !ok {
		return s.editEmbed(sess, i, &discordgo.MessageEmbed{
			Color:       chatErrEmbedColor,
			Title:       "❌ Typecheck Failed",
			Description: fmt.Sprintf("Fix these errors before opening a PR.\n```\n%s\n```", truncateHard(out, 3800)),
		})
	}

	title := customTitle
	if title == "" {
		if msg, err := s.getLastCommitMessage(ctx, state.worktreePath); err == nil {
			title = msg
		} else {
			title = "RMHBot changes on " + state.branchName
		}
	}

	body := strings.Join([]string{
		"## RMHBot Changes", "",
		fmt.Sprintf("Branch: `%s`", state.branchName),
		fmt.Sprintf("Requested by: **%s** (Discord ID `%s`)", state.discordUsername, state.discordUserID),
		"", "---", "*Opened via RMHBot `/rmhbot-push`*",
	}, "\n")

	prURL, err := s.createPullRequest(ctx, state.branchName, title, body)
	if err != nil {
		return s.editEmbed(sess, i, &discordgo.MessageEmbed{
			Color:       chatErrEmbedColor,
			Title:       "❌ PR Creation Failed",
			Description: truncateHard(err.Error(), 3900),
		})
	}

	s.removeWorktree(state.worktreePath)
	s.deleteSession(userID)
	return s.editEmbed(sess, i, &discordgo.MessageEmbed{
		Color:       0x22c55e,
		Title:       "✅ PR Opened!",
		Description: fmt.Sprintf("%s\n\nOnce merged, the site will redeploy automatically.", prURL),
	})
}

// ─── embed helpers ──────────────────────────────────────────────────────────

func errorEmbed(branch, msg string) *discordgo.MessageEmbed {
	return &discordgo.MessageEmbed{
		Color:       chatErrEmbedColor,
		Title:       "❌ Error",
		Description: fmt.Sprintf("Branch: `%s`\n\n%s", branch, truncateHard(msg, 3900)),
	}
}

func (s *RmhbotService) finalizeEmbed(state *conversationState, sha string, changedFiles []string, summary string) *discordgo.MessageEmbed {
	var fileLines []string
	for _, f := range changedFiles {
		fileLines = append(fileLines, "• `"+f+"`")
	}
	fileList := "• No files changed"
	if len(fileLines) > 0 {
		fileList = truncateHard(strings.Join(fileLines, "\n"), 1024)
	}
	if summary == "" {
		summary = "Changes applied."
	}
	return &discordgo.MessageEmbed{
		Color:       0x22c55e,
		Title:       fmt.Sprintf("✅ Done | Commit `%s`", sha),
		Description: fmt.Sprintf("Branch: `%s`", state.branchName),
		Fields: []*discordgo.MessageEmbedField{
			{Name: "📝 Changes", Value: fileList},
			{Name: "📋 Summary", Value: truncateHard(summary, 1024)},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: state.discordUsername},
	}
}

func (s *RmhbotService) finalizeNoChangesEmbed(state *conversationState, summary string) *discordgo.MessageEmbed {
	if summary == "" {
		summary = "No file changes were made."
	}
	return &discordgo.MessageEmbed{
		Color:       0x22c55e,
		Title:       "✅ Done",
		Description: fmt.Sprintf("Branch: `%s`", state.branchName),
		Fields: []*discordgo.MessageEmbedField{
			{Name: "📋 Summary", Value: truncateHard(summary, 1024)},
		},
		Footer: &discordgo.MessageEmbedFooter{Text: state.discordUsername},
	}
}

func (s *RmhbotService) editText(sess *discordgo.Session, i *discordgo.InteractionCreate, content string) error {
	_, err := sess.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Content: &content})
	return err
}

func (s *RmhbotService) editEmbed(sess *discordgo.Session, i *discordgo.InteractionCreate, embed *discordgo.MessageEmbed) error {
	_, err := sess.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Embeds: &[]*discordgo.MessageEmbed{embed}})
	return err
}
