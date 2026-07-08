//go:build !windows

package hidefile

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func hideOS(path string) (string, error) {
	dir, name := filepath.Split(filepath.Clean(path))
	if strings.HasPrefix(name, ".") {
		return path, nil // already hidden
	}

	newPath := filepath.Join(dir, "."+name)
	if err := os.Rename(path, newPath); err != nil {
		return "", fmt.Errorf("hidefile: renaming %q: %w", path, err)
	}
	return newPath, nil
}

func showOS(path string) (string, error) {
	dir, name := filepath.Split(filepath.Clean(path))
	if !strings.HasPrefix(name, ".") {
		return path, nil // already visible
	}

	newPath := filepath.Join(dir, strings.TrimPrefix(name, "."))
	if err := os.Rename(path, newPath); err != nil {
		return "", fmt.Errorf("hidefile: renaming %q: %w", path, err)
	}
	return newPath, nil
}

func isHiddenOS(path string) (bool, error) {
	return strings.HasPrefix(filepath.Base(filepath.Clean(path)), "."), nil
}
