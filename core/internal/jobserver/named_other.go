//go:build !windows

package jobserver

import "errors"

// ErrJobServerNotFound is shared across platforms so callers can check it
// without relying on build tags.
var ErrJobServerNotFound = errors.New("jobserver: named semaphore not found")

// Attach is not supported on non-Windows platforms yet.
//
// It exists for API compatibility; current implementations are Windows-only.
func Attach(name string) (Pool, error) {
	return nil, errors.New("jobserver: Attach not implemented on this platform")
}
