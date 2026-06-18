package doctrine

import (
	"time"
)

// millisUntilMidnightUTC returns the duration from `now` until the next
// midnight UTC, reproducing the Node getMillisUntilMidnightUTC():
//
//	midnight = now; midnight.setUTCDate(date+1); midnight.setUTCHours(0,0,0,0)
//	return midnight - now
func millisUntilMidnightUTC(now time.Time) time.Duration {
	now = now.UTC()
	next := now.AddDate(0, 0, 1)
	midnight := time.Date(next.Year(), next.Month(), next.Day(), 0, 0, 0, 0, time.UTC)
	return midnight.Sub(now)
}

// isSahurHour reports whether the local hour in `timezone` at time `t` is 3,
// reproducing the Node isSahurHour() (Intl hour in 24h format == 3). Unknown
// timezones return false, matching the JS try/catch fallback.
func isSahurHour(timezone string, t time.Time) bool {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return false
	}
	return t.In(loc).Hour() == 3
}

// toLower lowercases an ASCII mode name. The mode constants are ASCII-only, so
// a byte-wise lower keeps this allocation-light and matches mode.toLowerCase().
func toLower(s string) string {
	b := []byte(s)
	for i := range b {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 'a' - 'A'
		}
	}
	return string(b)
}
