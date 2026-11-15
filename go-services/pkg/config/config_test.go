package config

import "testing"

func TestLoadCommonRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := LoadCommon("assets"); err == nil {
		t.Fatal("DATABASE_URL unset must be an error")
	}
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("METRICS_ADDR", "")
	c, err := LoadCommon("assets")
	if err != nil {
		t.Fatal(err)
	}
	if c.ServiceName != "assets" || c.DatabaseURL != "postgres://x" || c.MetricsAddr != ":9090" {
		t.Fatalf("LoadCommon: %+v", c)
	}
}

func TestGetDurationFallsBackOnGarbage(t *testing.T) {
	t.Setenv("X_GRACE", "soon")
	if got := GetDuration("X_GRACE", 5); got != 5 {
		t.Fatalf("unparsable duration must fall back: %v", got)
	}
}
