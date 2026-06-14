//go:build windows

package filelock

import (
	"golang.org/x/sys/windows"
)

// Lock acquires an exclusive lock on the file.
func (l *Lock) Lock() error {
	if l == nil || l.file == nil {
		return ErrNotInitialized
	}

	var ol windows.Overlapped

	// windows.LOCKFILE_EXCLUSIVE_LOCK requests an exclusive lock.
	return windows.LockFileEx(
		windows.Handle(l.file.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK,
		0,
		^uint32(0), // lengthLow
		^uint32(0), // lengthHigh
		&ol,
	)
}

// Unlock releases the previously acquired exclusive lock.
func (l *Lock) Unlock() error {
	if l == nil || l.file == nil {
		return nil
	}

	var ol windows.Overlapped

	return windows.UnlockFileEx(
		windows.Handle(l.file.Fd()),
		0,
		^uint32(0), // lengthLow
		^uint32(0), // lengthHigh
		&ol,
	)
}
