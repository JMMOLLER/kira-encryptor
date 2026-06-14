//go:build unix

package filelock

import (
	"golang.org/x/sys/unix"
)

// Lock acquires an exclusive lock on the file.
// It blocks the current goroutine until the lock can be acquired.
func (l *Lock) Lock() error {
	if l == nil || l.file == nil {
		return ErrNotInitialized
	}

	// unix.LOCK_EX asks for an exclusive lock.
	return unix.Flock(int(l.file.Fd()), unix.LOCK_EX)
}

// Unlock releases the previously acquired exclusive lock.
func (l *Lock) Unlock() error {
	if l == nil || l.file == nil {
		return nil
	}

	// unix.LOCK_UN removes the lock.
	return unix.Flock(int(l.file.Fd()), unix.LOCK_UN)
}