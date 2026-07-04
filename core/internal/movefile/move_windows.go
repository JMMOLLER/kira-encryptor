//go:build windows

package movefile

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// MoveFileExW flags:
//
//	0x1: replace existing destination.
//	0x2: allow cross-volume moves.
//	0x8: flush copied data before returning.
const moveFileExFlags = uint32(0x1 | 0x2 | 0x8)

// moveOS uses MoveFileExW to move a file on Windows.
func moveOS(src, dst string) error {
	srcPtr, err := windows.UTF16PtrFromString(src)
	if err != nil {
		return fmt.Errorf("movefile: encoding src path: %w", err)
	}

	dstPtr, err := windows.UTF16PtrFromString(dst)
	if err != nil {
		return fmt.Errorf("movefile: encoding dst path: %w", err)
	}

	if err := windows.MoveFileEx(srcPtr, dstPtr, moveFileExFlags); err != nil {
		return fmt.Errorf("movefile: MoveFileEx: %w", err)
	}

	return nil
}

// moveDirOS renames the directory when possible and falls back to
// copyDirThenDelete when src and dst are on different volumes.
func moveDirOS(src, dst string) error {
	err := os.Rename(src, dst)
	if err == nil {
		return nil
	}

	var linkErr *os.LinkError
	if errors.As(err, &linkErr) && errors.Is(linkErr.Err, windows.ERROR_NOT_SAME_DEVICE) {
		return copyDirThenDelete(src, dst)
	}

	return err
}
