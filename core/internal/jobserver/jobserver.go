// Package jobserver implements a bounded concurrency pool based on tokens.
//
// Two implementations exist:
//
//   - NewLocal: a per-call local pool used for a single operation.
//   - Attach: (Windows only) connects to a named semaphore created externally.
package jobserver

import (
	"context"
	"runtime"
)

// Token represents a unit of concurrency obtained from a pool.
// It must be released when the work is done.
type Token struct {
	release func()
}

// Release returns the token back to its pool.
// It is safe to call on a zero-value Token.
func (t Token) Release() {
	if t.release != nil {
		t.release()
	}
}

// Pool manages concurrency tokens.
type Pool interface {
	// Acquire blocks until a token is available or the context is canceled.
	Acquire(ctx context.Context) (Token, error)

	// Close releases any resources held by the pool.
	Close() error
}

// ResolveSize normalizes the requested concurrency level.
// If the value is non-positive, it falls back to the number of CPUs.
func ResolveSize(concurrency int) int {
	if concurrency <= 0 {
		return runtime.NumCPU()
	}
	return concurrency
}
