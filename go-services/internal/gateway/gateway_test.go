package gateway

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rmhstudios/rmh-go/pkg/auth"
	"github.com/rmhstudios/rmh-go/pkg/log"
)

func testRouter(t *testing.T) *Router {
	t.Helper()
	r, err := NewRouter(LoadConfig(), log.New("gateway-test", "error"))
	if err != nil {
		t.Fatalf("NewRouter: %v", err)
	}
	return r
}

// TestPrefixRouterSelection verifies the longest-matching-prefix selection and
// the fall-through to the web (catch-all) upstream.
func TestPrefixRouterSelection(t *testing.T) {
	r := testRouter(t)

	cases := []struct {
		path       string
		wantPrefix string // "" => web catch-all
	}{
		{"/socket/io", "/socket/"},
		{"/rmhbox-ws/abc", "/rmhbox-ws/"},
		{"/rmhtube-ws/", "/rmhtube-ws/"},
		{"/rmhmusic-ws/x", "/rmhmusic-ws/"},
		{"/", ""},
		{"/api/anything", ""},
		{"/assets/app.js", ""},
		{"/socket", ""},    // no trailing slash => not the /socket/ prefix
		{"/rmhbox-ws", ""}, // ditto
	}

	for _, c := range cases {
		got := r.pick(c.path)
		if c.wantPrefix == "" {
			if got != r.web {
				t.Errorf("pick(%q) = prefix %q, want web catch-all", c.path, got.prefix)
			}
			continue
		}
		if got == r.web {
			t.Errorf("pick(%q) = web catch-all, want prefix %q", c.path, c.wantPrefix)
			continue
		}
		if got.prefix != c.wantPrefix {
			t.Errorf("pick(%q) = prefix %q, want %q", c.path, got.prefix, c.wantPrefix)
		}
	}
}

// fakeValidator implements SessionValidator without a database.
type fakeValidator struct {
	id  auth.Identity
	err error
}

func (f fakeValidator) ValidateSession(_ context.Context, token string) (auth.Identity, error) {
	if f.err != nil {
		return auth.Identity{}, f.err
	}
	return f.id, nil
}

// captureHandler records the identity headers it received from upstream.
type captureHandler struct{ got http.Header }

func (h *captureHandler) ServeHTTP(_ http.ResponseWriter, r *http.Request) { h.got = r.Header.Clone() }

func TestAuthMiddlewareInjectsHeadersForValidToken(t *testing.T) {
	cap := &captureHandler{}
	v := fakeValidator{id: auth.Identity{UserID: "u1", Name: "Alice", IsAdmin: true}}
	h := AuthMiddleware(v)(cap)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer goodtoken")
	h.ServeHTTP(httptest.NewRecorder(), req)

	if g := cap.got.Get(HeaderUserID); g != "u1" {
		t.Errorf("%s = %q, want u1", HeaderUserID, g)
	}
	if g := cap.got.Get(HeaderName); g != "Alice" {
		t.Errorf("%s = %q, want Alice", HeaderName, g)
	}
	if g := cap.got.Get(HeaderIsAdmin); g != "true" {
		t.Errorf("%s = %q, want true", HeaderIsAdmin, g)
	}
}

func TestAuthMiddlewareStripsClientSuppliedHeaders(t *testing.T) {
	cap := &captureHandler{}
	// Invalid token: middleware must pass through anonymous AND strip the forged
	// identity headers the client tried to inject.
	v := fakeValidator{err: auth.ErrUnauthenticated}
	h := AuthMiddleware(v)(cap)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer badtoken")
	req.Header.Set(HeaderUserID, "attacker")
	req.Header.Set(HeaderName, "Mallory")
	req.Header.Set(HeaderIsAdmin, "true")
	h.ServeHTTP(httptest.NewRecorder(), req)

	for _, hdr := range []string{HeaderUserID, HeaderName, HeaderIsAdmin} {
		if g := cap.got.Get(hdr); g != "" {
			t.Errorf("forged %s leaked to upstream: %q", hdr, g)
		}
	}
}

func TestAuthMiddlewareAnonymousPassThrough(t *testing.T) {
	cap := &captureHandler{}
	v := fakeValidator{err: errors.New("should not be called")}
	h := AuthMiddleware(v)(cap)

	// No token at all => anonymous, no identity headers, not blocked.
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if cap.got == nil {
		t.Fatal("next handler was not called for anonymous request")
	}
	if g := cap.got.Get(HeaderUserID); g != "" {
		t.Errorf("anonymous request carried %s = %q", HeaderUserID, g)
	}
}

func TestRequireAuth(t *testing.T) {
	ok := &captureHandler{}
	guard := RequireAuth(ok)

	// Without the gateway-asserted user id => 401.
	rec := httptest.NewRecorder()
	guard.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/x", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("missing id: status = %d, want 401", rec.Code)
	}

	// With the id present => passes through.
	rec = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/x", nil)
	req.Header.Set(HeaderUserID, "u1")
	guard.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("present id: status = %d, want 200", rec.Code)
	}
	if ok.got == nil {
		t.Error("authed request did not reach the wrapped handler")
	}
}
