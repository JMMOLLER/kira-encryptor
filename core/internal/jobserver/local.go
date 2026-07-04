package jobserver

import "context"

// localPool implements a simple in-process concurrency limiter.
//
// It uses a buffered channel as a semaphore. The pool is entirely local
// to a single call and does not interact with any external or shared state.
type localPool struct {
	tokens chan struct{}
}

// NewLocal creates a Pool with a fixed number of tokens.
// The caller is expected to normalize n using ResolveSize if needed.
func NewLocal(n int) Pool {
	return &localPool{
		tokens: make(chan struct{}, n),
	}
}

// Acquire blocks until a token is available or the context is canceled.
func (p *localPool) Acquire(ctx context.Context) (Token, error) {
	select {
	case p.tokens <- struct{}{}:
		return Token{
			release: func() { <-p.tokens },
		}, nil

	case <-ctx.Done():
		return Token{}, ctx.Err()
	}
}

// Close is a no-op for localPool since no external resources are held.
func (p *localPool) Close() error {
	return nil
}
