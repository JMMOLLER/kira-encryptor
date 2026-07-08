// Package hidefile provides cross-platform file and directory hiding.
// On POSIX systems, Hide/Show may rename the target.
package hidefile

// Hide hides a file or directory and returns its resulting path.
func Hide(path string) (string, error) {
	return hideOS(path)
}

// Show reveals a hidden file or directory and returns its resulting path.
func Show(path string) (string, error) {
	return showOS(path)
}

// IsHidden reports whether a path is hidden.
func IsHidden(path string) (bool, error) {
	return isHiddenOS(path)
}
