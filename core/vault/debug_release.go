//go:build !debug

package vault

import (
	"errors"

	"github.com/awnumar/memguard"
)

var errDebugDisabled = errors.New("vault: debug export disabled in this build (rebuild with -tags debug)")

// DebugExportPlaintext is unavailable in non-debug builds.
func (v *Vault) DebugExportPlaintext(path string) error {
	return errDebugDisabled
}

// DebugDecryptToJSON is unavailable in non-debug builds.
func DebugDecryptToJSON(binPath string, password *memguard.LockedBuffer, outPath string) error {
	return errDebugDisabled
}
