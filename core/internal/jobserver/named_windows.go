//go:build windows

package jobserver

import (
	"context"
	"errors"
	"fmt"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ErrJobServerNotFound is returned when the named semaphore does not exist.
// The semaphore must be created externally; this package only attaches to it.
var ErrJobServerNotFound = errors.New("jobserver: named semaphore not found")

// kernel32 bindings used directly for semaphore operations.
// Not all functionality is exposed consistently in higher-level wrappers.
var (
	modkernel32          = windows.NewLazySystemDLL("kernel32.dll")
	procOpenSemaphoreW   = modkernel32.NewProc("OpenSemaphoreW")
	procReleaseSemaphore = modkernel32.NewProc("ReleaseSemaphore")
)

const semaphoreSynchronize = 0x00100000 // SYNCHRONIZE
const semaphoreModifyState = 0x00000002 // SEMAPHORE_MODIFY_STATE
const semaphoreAllAccess = semaphoreSynchronize | semaphoreModifyState

// namedPool wraps a handle to a semaphore created by another process.
type namedPool struct {
	handle windows.Handle
}

// Attach opens an existing named semaphore.
// It never creates it; if missing, ErrJobServerNotFound is returned.
func Attach(name string) (Pool, error) {
	namePtr, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return nil, fmt.Errorf("jobserver: invalid name %q: %w", name, err)
	}

	r0, _, e1 := procOpenSemaphoreW.Call(
		uintptr(semaphoreAllAccess),
		0, // bInheritHandle = FALSE
		uintptr(unsafe.Pointer(namePtr)),
	)
	if r0 == 0 {
		if e1 == windows.ERROR_FILE_NOT_FOUND {
			return nil, ErrJobServerNotFound
		}
		return nil, fmt.Errorf("jobserver: OpenSemaphore failed: %w", e1)
	}

	return &namedPool{handle: windows.Handle(r0)}, nil
}

// Acquire waits for a token from the semaphore.
//
// Because WaitForSingleObject does not support context cancellation,
// it is polled periodically to allow responsive cancellation.
func (p *namedPool) Acquire(ctx context.Context) (Token, error) {
	const pollInterval = 50 * time.Millisecond

	for {
		select {
		case <-ctx.Done():
			return Token{}, ctx.Err()
		default:
		}

		event, err := windows.WaitForSingleObject(p.handle, uint32(pollInterval/time.Millisecond))
		switch event {
		case windows.WAIT_OBJECT_0:
			return Token{release: p.release}, nil
		case uint32(windows.WAIT_TIMEOUT):
			continue // no token yet, loop back and re-check ctx
		default:
			if err != nil {
				return Token{}, fmt.Errorf("jobserver: WaitForSingleObject failed: %w", err)
			}
			return Token{}, fmt.Errorf("jobserver: unexpected wait result: %d", event)
		}
	}
}

// release returns one token back to the semaphore.
func (p *namedPool) release() {
	_, _, _ = procReleaseSemaphore.Call(
		uintptr(p.handle),
		1,
		0, // lpPreviousCount not needed
	)
}

// Close releases the handle to the underlying semaphore.
// The kernel object is cleaned up automatically when all handles are closed.
func (p *namedPool) Close() error {
	return windows.CloseHandle(p.handle)
}
