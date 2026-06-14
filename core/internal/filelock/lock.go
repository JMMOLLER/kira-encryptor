package filelock

import (
	"errors"
	"os"
)

var ErrNotInitialized = errors.New("filelock: lock not initialized")

type Lock struct {
	file *os.File
	path string
}

// New creates a new Lock for the specified file path. It attempts to acquire an exclusive lock on the file.
func New(path string) (*Lock, error) {
	// 0600 ensures only the owner can read/write the lock file.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}

	l := &Lock{
		file: f,
		path: path,
	}

	// Attempt to acquire the OS-level lock.
	if err := l.Lock(); err != nil {
		_ = f.Close()
		return nil, err
	}

	return l, nil
}

// Path returns the absolute or relative file path of the lock.
func (l *Lock) Path() string {
	if l == nil {
		return ""
	}
	return l.path
}

// Close releases the lock and closes the underlying file descriptor.
func (l *Lock) Close() error {
	if l == nil || l.file == nil {
		return nil
	}

	// Ensure we release the lock before closing the file.
	_ = l.Unlock()
	// Close the file and capture any error.
	err := l.file.Close()
	// Prevent accidental double-close operations
	l.file = nil

	return err
}
