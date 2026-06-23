//go:build e2e

package e2e

import (
	"encoding/json"
	"net/http"
	"os"
	"testing"
)

// supervisorHealthURL is the supervisor /health endpoint on its metrics addr
// (default :9090). Set E2E_SUPERVISOR_URL to override when the supervisor is
// not on localhost.
func supervisorHealthURL() string {
	return env("E2E_SUPERVISOR_URL", "http://localhost:9090/health")
}

// TestSupervisorHealth hits the supervisor /health endpoint and asserts HTTP
// 200 with status:"ok". The test is skipped when E2E_SUPERVISOR_URL is unset
// AND no supervisor is reachable at the default address — to match how the
// rest of the suite gates on env vars, we require the explicit env flag.
func TestSupervisorHealth(t *testing.T) {
	if os.Getenv("E2E_SUPERVISOR_URL") == "" {
		t.Skip("E2E_SUPERVISOR_URL not set; skipping supervisor smoke test")
	}

	url := supervisorHealthURL()
	resp, err := http.Get(url) //nolint:noctx
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET %s: want 200, got %d", url, resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode /health body: %v", err)
	}

	if got, _ := body["status"].(string); got != "ok" {
		t.Fatalf("/health body: want status=ok, got %v (full body: %v)", got, body)
	}
	if got, _ := body["service"].(string); got != "supervisor" {
		t.Fatalf("/health body: want service=supervisor, got %v (full body: %v)", got, body)
	}

	t.Logf("supervisor /health OK: %v", body)
}
