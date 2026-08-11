package discordbot

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"
)

// One retry policy for the whole bot, because there was none.
//
// Everything this package talks to is a network that is sometimes down: the
// Discord gateway, Discord's REST API, DeepSeek, and Postgres. Before this file
// a single 429, a dropped connection or a five-second DNS blip lost whatever was
// in flight — a day's summary, a weekly digest, a message row that can never be
// recomputed because the gateway does not redeliver.
//
// # What is and is not retried
//
// Retrying is only safe for an operation that either did not happen or can
// happen twice harmlessly. That is a property of the CALL SITE, not of the
// error, so callers say so: wrap an error in `permanent()` and the loop stops
// immediately. The default is to retry, because the common case here is a
// transient network fault.
//
// # Why bounded, and why jitter
//
// Unbounded retries turn a dead dependency into a hot loop that keeps it dead.
// Every schedule here has a hard attempt cap and full jitter — several bots
// reconnecting on the same exponential curve is a thundering herd, and the
// randomisation is what spreads them.

// retryPolicy is a bounded exponential backoff schedule.
type retryPolicy struct {
	// Attempts is the TOTAL number of tries, not the number of retries. 1 means
	// "call it once and do not retry".
	Attempts int
	// Base is the first delay; each subsequent one doubles it, capped at Max.
	Base time.Duration
	Max  time.Duration
}

// Sensible schedules for the three things this package waits on.
var (
	// retryAPI is for a request whose result somebody is waiting for — a model
	// completion, a channel post. Short and few: past about ten seconds the
	// caller's own deadline is the real limit.
	retryAPI = retryPolicy{Attempts: 4, Base: 500 * time.Millisecond, Max: 8 * time.Second}

	// retryDB is for a statement against Postgres. More attempts and a tighter
	// base than the API schedule: a pool blip or a failover is measured in
	// hundreds of milliseconds, and the row being written is often one the
	// gateway will never send again.
	retryDBPolicy = retryPolicy{Attempts: 5, Base: 100 * time.Millisecond, Max: 2 * time.Second}

	// retryGateway is for opening the Discord websocket at boot. Long and
	// patient on purpose — this worker shares a process with five others, and
	// failing here takes all of them down (cmd/supervisor: any worker's error
	// cancels the group). Discord being unreachable for a minute must not do
	// that.
	retryGateway = retryPolicy{Attempts: 8, Base: 2 * time.Second, Max: 60 * time.Second}
)

// permanentError marks a failure that retrying cannot fix.
type permanentError struct{ err error }

func (e *permanentError) Error() string { return e.err.Error() }
func (e *permanentError) Unwrap() error { return e.err }

// permanent wraps an error so the retry loop gives up immediately. Use it for
// anything the next attempt would answer identically: a bad API key, a malformed
// request, a channel that does not exist.
func permanent(err error) error {
	if err == nil {
		return nil
	}
	return &permanentError{err: err}
}

// isPermanent reports whether an error is marked as not worth retrying.
func isPermanent(err error) bool {
	var p *permanentError
	return errors.As(err, &p)
}

// retryAfterError carries a server-specified wait, so a 429 is honoured rather
// than guessed at. A Retry-After longer than the policy's Max is respected: the
// server knows better than the schedule does.
type retryAfterError struct {
	err   error
	after time.Duration
}

func (e *retryAfterError) Error() string { return e.err.Error() }
func (e *retryAfterError) Unwrap() error { return e.err }

// retryAfter wraps an error with the delay the server asked for.
func retryAfter(err error, after time.Duration) error {
	if err == nil {
		return nil
	}
	return &retryAfterError{err: err, after: after}
}

// backoff returns the delay before attempt `n` (1-indexed: the wait AFTER the
// first failure is backoff(1)).
//
// Full jitter — a uniform draw from [0, exponential) rather than the exponential
// itself. Equal-jitter and no-jitter schedules both leave clients synchronised
// after a shared outage, which is exactly when the dependency can least afford
// them all arriving together.
func (p retryPolicy) backoff(n int, rng *rand.Rand) time.Duration {
	if n < 1 {
		n = 1
	}
	delay := p.Base
	for i := 1; i < n && delay < p.Max; i++ {
		delay *= 2
	}
	if delay > p.Max {
		delay = p.Max
	}
	if delay <= 0 {
		return 0
	}
	return time.Duration(rng.Int63n(int64(delay)) + int64(delay)/2)
}

// retryLogger is the subset of pkg/log this file needs, so a test can pass nil.
type retryLogger interface {
	Warn(msg string, args ...any)
}

// withRetry calls `fn` until it succeeds, gives up, or the context ends.
//
// The last error is returned unwrapped enough to still be inspectable with
// errors.As — a caller that wants to know it was a 404 still can.
func withRetry(
	ctx context.Context,
	logger retryLogger,
	label string,
	policy retryPolicy,
	fn func(ctx context.Context) error,
) error {
	attempts := policy.Attempts
	if attempts < 1 {
		attempts = 1
	}
	// Seeded per call rather than from the global source: the global one is
	// mutex-guarded and this can be called from several gateway goroutines at
	// once, and the values here only need to be spread, not unpredictable.
	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	var err error
	for attempt := 1; attempt <= attempts; attempt++ {
		if ctxErr := ctx.Err(); ctxErr != nil {
			// A cancelled context is a shutdown, not a failure to report.
			if err != nil {
				return err
			}
			return ctxErr
		}
		err = fn(ctx)
		if err == nil {
			return nil
		}
		if isPermanent(err) || attempt == attempts {
			return err
		}

		delay := policy.backoff(attempt, rng)
		var after *retryAfterError
		if errors.As(err, &after) && after.after > delay {
			delay = after.after
		}
		if logger != nil {
			logger.Warn("retrying after error",
				"op", label, "attempt", attempt, "of", attempts,
				"in", delay.String(), "error", err.Error())
		}

		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return err
		case <-timer.C:
		}
	}
	return fmt.Errorf("%s: %w", label, err)
}
