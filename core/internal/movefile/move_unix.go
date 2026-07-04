//go:build unix

package movefile

import (
	"errors"
	"os"
	"syscall"
)

// moveOS performs an atomic rename when possible and falls back to
// copyThenDelete on EXDEV.
func moveOS(src, dst string) error {
	err := os.Rename(src, dst)
	if err == nil {
		return nil
	}

	// os.Rename returns *os.LinkError on EXDEV.
	var linkErr *os.LinkError
	if errors.As(err, &linkErr) && errors.Is(linkErr.Err, syscall.EXDEV) {
		return copyThenDelete(src, dst)
	}

	return err
}

// moveDirOS performs an atomic rename when possible and falls back to
// copyDirThenDelete on EXDEV.
func moveDirOS(src, dst string) error {
	err := os.Rename(src, dst)
	if err == nil {
		return nil
	}

	// os.Rename returns *os.LinkError on EXDEV.
	var linkErr *os.LinkError
	if errors.As(err, &linkErr) && errors.Is(linkErr.Err, syscall.EXDEV) {
		return copyDirThenDelete(src, dst)
	}

	return err
}
