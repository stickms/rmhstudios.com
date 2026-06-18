package gateway

import (
	"context"
	"net/http"
	"strings"

	"github.com/rmhstudios/rmh-go/pkg/auth"
	"github.com/rmhstudios/rmh-go/pkg/httpx"
)

// trustedHeaderPrefix namespaces every gateway-asserted identity header. The
// gateway is the trust boundary: it strips the ENTIRE prefix from inbound
// requests before validating, so neither today's headers nor any future
// X-Rmh-* header can be forged by a client.
const trustedHeaderPrefix = "X-Rmh-"

// Trusted identity headers injected toward upstreams.
const (
	HeaderUserID  = "X-Rmh-User-Id"
	HeaderName    = "X-Rmh-User-Name"
	HeaderIsAdmin = "X-Rmh-Is-Admin"
)

// SessionValidator is the narrow dependency the auth middleware needs. The real
// implementation is *auth.Validator (backed by the DB pool); tests supply a
// fake, so the middleware can be exercised with httptest alone — no database.
type SessionValidator interface {
	ValidateSession(ctx context.Context, token string) (auth.Identity, error)
}

// AuthMiddleware validates the Better Auth session and, on success, injects the
// trusted identity headers toward the upstream. It is NON-blocking: an invalid
// or absent token simply passes through as anonymous (the SSR app renders its
// own auth pages). Use RequireAuth to gate routes that must be authenticated.
func AuthMiddleware(v SessionValidator) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Trust boundary: drop ALL client-supplied X-Rmh-* headers up front,
			// regardless of whether the token validates, so a forged header (even
			// one we don't inject today) can never reach an upstream.
			for name := range r.Header {
				if strings.HasPrefix(http.CanonicalHeaderKey(name), trustedHeaderPrefix) {
					r.Header.Del(name)
				}
			}

			if token := httpx.SessionToken(r); token != "" {
				if id, err := v.ValidateSession(r.Context(), token); err == nil {
					r.Header.Set(HeaderUserID, id.UserID)
					r.Header.Set(HeaderName, id.Name)
					if id.IsAdmin {
						r.Header.Set(HeaderIsAdmin, "true")
					} else {
						r.Header.Set(HeaderIsAdmin, "false")
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireAuth wraps a handler so that requests without a gateway-asserted user
// id (i.e. unauthenticated, after AuthMiddleware has run) get a 401. It is an
// opt-in helper for future Go API routes; the proxy catch-all does not use it.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(HeaderUserID) == "" {
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
