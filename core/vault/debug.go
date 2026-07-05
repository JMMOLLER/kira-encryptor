//go:build debug

package vault

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/awnumar/memguard"
)

// DebugExportPlaintext writes the decrypted vault contents as formatted JSON.
//
// This function is available only in debug builds.
func (v *Vault) DebugExportPlaintext(path string) error {
	v.mu.RLock()
	defer v.mu.RUnlock()

	b, err := json.MarshalIndent(v.data, "", "  ")
	if err != nil {
		return fmt.Errorf("vault: marshaling debug export: %w", err)
	}

	// Restrict access since the output contains decrypted vault data.
	return os.WriteFile(path, b, 0600)
}

// DebugDecryptToJSON decrypts a vault file and exports it as JSON.
//
// Available only in debug builds.
func DebugDecryptToJSON(binPath string, password *memguard.LockedBuffer, outPath string) error {
	v, err := New(password, binPath)
	if err != nil {
		return fmt.Errorf("vault: opening for debug export: %w", err)
	}

	return v.DebugExportPlaintext(outPath)
}
