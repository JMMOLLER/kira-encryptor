//go:build windows

package hidefile

import (
	"fmt"

	"golang.org/x/sys/windows"
)

func hideOS(path string) (string, error) {
	attrs, ptr, err := getAttrs(path)
	if err != nil {
		return "", err
	}
	if attrs&windows.FILE_ATTRIBUTE_HIDDEN != 0 {
		return path, nil
	}
	if err := windows.SetFileAttributes(ptr, attrs|windows.FILE_ATTRIBUTE_HIDDEN); err != nil {
		return "", fmt.Errorf("hidefile: setting hidden attribute on %q: %w", path, err)
	}
	return path, nil
}

func showOS(path string) (string, error) {
	attrs, ptr, err := getAttrs(path)
	if err != nil {
		return "", err
	}
	if attrs&windows.FILE_ATTRIBUTE_HIDDEN == 0 {
		return path, nil
	}
	if err := windows.SetFileAttributes(ptr, attrs&^windows.FILE_ATTRIBUTE_HIDDEN); err != nil {
		return "", fmt.Errorf("hidefile: clearing hidden attribute on %q: %w", path, err)
	}
	return path, nil
}

func isHiddenOS(path string) (bool, error) {
	attrs, _, err := getAttrs(path)
	if err != nil {
		return false, err
	}
	return attrs&windows.FILE_ATTRIBUTE_HIDDEN != 0, nil
}

// getAttrs returns the file attributes and UTF-16 path pointer.
func getAttrs(path string) (uint32, *uint16, error) {
	ptr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return 0, nil, fmt.Errorf("hidefile: encoding path %q: %w", path, err)
	}
	attrs, err := windows.GetFileAttributes(ptr)
	if err != nil {
		return 0, nil, fmt.Errorf("hidefile: getting attributes for %q: %w", path, err)
	}
	return attrs, ptr, nil
}
