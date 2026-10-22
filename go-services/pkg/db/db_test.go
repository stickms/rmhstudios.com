package db

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/rmhstudios/rmh-go/pkg/config"
)

func TestPoolConfigAppliesConfiguredSize(t *testing.T) {
	const dsn = "postgres://u:p@localhost:5432/d"
	for _, n := range []int32{1, 3, config.MaxGoDBPoolSize} {
		cfg, err := newPoolConfig(dsn, n)
		if err != nil {
			t.Fatal(err)
		}
		if cfg.MaxConns != n {
			t.Errorf("MaxConns = %d, want %d", cfg.MaxConns, n)
		}
	}
	// The size that comes out of config is what reaches the pool, and it is
	// never above the cap even when the env asks for more.
	t.Setenv("DATABASE_URL", dsn)
	t.Setenv("GO_DB_POOL_SIZE", "99")
	c, _ := config.LoadCommon("supervisor")
	cfg, _ := newPoolConfig(c.DatabaseURL, c.DBPoolSize)
	if cfg.MaxConns != config.MaxGoDBPoolSize {
		t.Errorf("MaxConns = %d, want cap %d", cfg.MaxConns, config.MaxGoDBPoolSize)
	}
}

// WaitForReachable used to return a 1-connection pool whatever was configured.
// Against a real database (RMH_PERF_DSN) the pool it hands back has the size asked for.
func TestWaitForReachableReturnsConfiguredPool(t *testing.T) {
	dsn := os.Getenv("RMH_PERF_DSN")
	if dsn == "" {
		t.Skip("RMH_PERF_DSN not set")
	}
	d, err := WaitForReachable(context.Background(), dsn, 3, 2, time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if got := d.Pool.Stat().MaxConns(); got != 3 {
		t.Fatalf("pool MaxConns = %d, want 3", got)
	}
}
