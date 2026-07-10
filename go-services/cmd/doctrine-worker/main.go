// Command doctrine-worker runs the doctrine scheduler standalone. The worker
// logic lives in internal/doctrine.Run; this wrapper only wires config, db,
// metrics, and the /health + /metrics server. The supervisor runs the same Run.
package main

import (
	"github.com/rmhstudios/rmh-go/internal/doctrine"
	"github.com/rmhstudios/rmh-go/pkg/worker"
)

func main() {
	worker.RunStandalone("doctrine-worker", "", doctrine.Run)
}
