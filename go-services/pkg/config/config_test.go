package config

import "testing"

func TestDBPoolSizeDefaultAndCap(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	cases := map[string]int32{
		"":    DefaultGoDBPoolSize, // unset -> production default
		"1":   1,
		"4":   4,
		"6":   MaxGoDBPoolSize,
		"50":  MaxGoDBPoolSize, // capped at the workers' concurrency
		"0":   1,               // never zero
		"-3":  1,
		"abc": DefaultGoDBPoolSize, // unparsable -> default
	}
	for env, want := range cases {
		t.Setenv("GO_DB_POOL_SIZE", env)
		c, err := LoadCommon("supervisor")
		if err != nil {
			t.Fatal(err)
		}
		if c.DBPoolSize != want {
			t.Errorf("GO_DB_POOL_SIZE=%q: DBPoolSize = %d, want %d", env, c.DBPoolSize, want)
		}
	}
}

func TestNodeHubPoolVariableIsNotRead(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("GO_DB_POOL_SIZE", "")
	t.Setenv("SERVER_DB_POOL_SIZE", "5")
	c, _ := LoadCommon("supervisor")
	if c.DBPoolSize != DefaultGoDBPoolSize {
		t.Fatalf("SERVER_DB_POOL_SIZE leaked into the Go pool: %d", c.DBPoolSize)
	}
}
