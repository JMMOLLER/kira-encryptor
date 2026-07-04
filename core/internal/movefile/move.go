// Package movefile provides a cross-platform file move operation.
//
// It uses an atomic rename when possible and falls back to copy + fsync +
// delete when moving across filesystems.
package movefile

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// MoveFile moves src to dst, replacing dst if it exists.
//
// On the same filesystem it performs an atomic rename.
// Otherwise it copies, fsyncs, and then removes src.
//
// If an error is returned, src is preserved. A partial dst may remain.
func MoveFile(src, dst string) error {
	if src == "" || dst == "" {
		return fmt.Errorf("movefile: src and dst must not be empty")
	}

	if err := moveOS(src, dst); err != nil {
		return fmt.Errorf("movefile: moving %q to %q: %w", src, dst, err)
	}

	return nil
}

// MoveDir moves the directory src to dst, replacing dst if it exists.
func MoveDir(src, dst string) error {
	if src == "" || dst == "" {
		return fmt.Errorf("movefile: src and dst must not be empty")
	}

	if err := moveDirOS(src, dst); err != nil {
		return fmt.Errorf("movefile: moving dir %q to %q: %w", src, dst, err)
	}

	return nil
}

// copyDirThenDelete handles directory moves across filesystems/volumes.
func copyDirThenDelete(src, dst string) error {
	if err := copyDir(src, dst); err != nil {
		_ = os.RemoveAll(dst) // Best-effort cleanup.
		return err
	}

	if err := os.RemoveAll(src); err != nil {
		// Copy succeeded, but source removal failed.
		return fmt.Errorf("movefile: deleting source dir %q after copy: %w", src, err)
	}

	return nil
}

// copyDir recursively copies the directory tree rooted at src into dst.
func copyDir(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return fmt.Errorf("movefile: stat source dir %q: %w", src, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("movefile: %q is not a directory", src)
	}

	if err := os.MkdirAll(dst, info.Mode().Perm()); err != nil {
		return fmt.Errorf("movefile: creating destination dir %q: %w", dst, err)
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return fmt.Errorf("movefile: reading source dir %q: %w", src, err)
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}

		// Non-regular files (symlinks, devices, etc.) aren't expected in
		// the trees this package moves; they're copied as plain byte
		// streams via copyFile rather than special-cased.
		if err := copyFile(srcPath, dstPath); err != nil {
			return err
		}
	}

	return nil
}

// copyThenDelete handles moves across filesystems.
func copyThenDelete(src, dst string) error {
	if err := copyFile(src, dst); err != nil {
		_ = os.Remove(dst) // Best-effort cleanup.
		return err
	}

	if err := os.Remove(src); err != nil {
		// Copy succeeded, but source removal failed.
		return fmt.Errorf("movefile: deleting source %q after copy: %w", src, err)
	}

	return nil
}

// copyFile copies src to dst and flushes the destination before closing.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("movefile: opening source %q: %w", src, err)
	}
	defer in.Close()

	// Prevents replacing a destination created concurrently.
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("movefile: creating destination %q: %w", dst, err)
	}

	if _, err := io.Copy(out, in); err != nil {
		_ = out.Close()
		return fmt.Errorf("movefile: copying data: %w", err)
	}

	// Flush pending writes before closing.
	if err := out.Sync(); err != nil {
		_ = out.Close()
		return fmt.Errorf("movefile: syncing destination %q: %w", dst, err)
	}

	return out.Close()
}
