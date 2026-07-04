package vault

import (
	"encoding/json"
	"errors"
	"os"
	"sync"

	"github.com/JMMOLLER/kira-encryptor/core/internal/filelock"
	"github.com/JMMOLLER/kira-encryptor/core/types"
)

type Vault struct {
	file     string
	lockPath string
	mu       sync.RWMutex // protects in-memory state within this process
	data     types.VaultFile
}

// New opens (or creates) the vault and loads its current state from disk.
// It ensures the initial read is synchronized with other processes.
func New(file string) (*Vault, error) {
	v := &Vault{
		file:     file,
		lockPath: file + ".lock",
		data: types.VaultFile{
			Body: make(map[string]json.RawMessage),
		},
	}

	if err := v.Refresh(); err != nil {
		return nil, err
	}

	return v, nil
}

func (v *Vault) SetHeader(header *types.VaultHeader) error {
	return v.withFileLock(func() error {
		v.data.Header = header
		return nil
	})
}

// Set stores a single key-value pair.
// The operation is atomic across processes.
func (v *Vault) Set(key string, value any) error {
	return v.withFileLock(func() error {
		b, err := json.Marshal(value)
		if err != nil {
			return err
		}

		v.data.Body[key] = b
		return nil
	})
}

// SetMany stores multiple key-value pairs in a single atomic operation.
// Prefer this over multiple Set calls when working with batches.
func (v *Vault) SetMany(entries map[string]any) error {
	return v.withFileLock(func() error {
		for key, value := range entries {
			b, err := json.Marshal(value)
			if err != nil {
				return err
			}
			v.data.Body[key] = b
		}
		return nil
	})
}

func (v *Vault) GetHeader() *types.VaultHeader {
	v.mu.RLock()
	defer v.mu.RUnlock()

	return v.data.Header
}

// Get retrieves a value and decodes it into dest.
func (v *Vault) Get(key string, dest any) error {
	v.mu.RLock()
	defer v.mu.RUnlock()

	value, ok := v.data.Body[key]
	if !ok {
		return errors.New("key not found")
	}

	return json.Unmarshal(value, dest)
}

// Delete removes a key from the vault.
func (v *Vault) Delete(key string) error {
	return v.withFileLock(func() error {
		delete(v.data.Body, key)
		return nil
	})
}

// Exists checks whether a key is present in memory.
func (v *Vault) Exists(key string) bool {
	v.mu.RLock()
	defer v.mu.RUnlock()

	_, ok := v.data.Body[key]
	return ok
}

// Keys returns all stored keys.
func (v *Vault) Keys() []string {
	v.mu.RLock()
	defer v.mu.RUnlock()

	keys := make([]string, 0, len(v.data.Body))
	for k := range v.data.Body {
		keys = append(keys, k)
	}

	return keys
}

// Clear removes all data from the vault.
// The operation is atomic across processes.
func (v *Vault) Clear() error {
	return v.withFileLock(func() error {
		v.data = types.VaultFile{
			Header: v.data.Header,
			Body:   make(map[string]json.RawMessage),
		}
		return nil
	})
}

// Refresh reloads the vault state from disk.
// It acquires the cross-process lock to ensure consistency.
func (v *Vault) Refresh() error {
	v.mu.Lock()
	defer v.mu.Unlock()

	lock, err := filelock.New(v.lockPath)
	if err != nil {
		return err
	}
	defer lock.Close()

	return v.reloadLocked()
}

// withFileLock wraps operations that must be atomic across processes.
// It reloads state before applying changes to avoid overwriting external updates.
func (v *Vault) withFileLock(fn func() error) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	lock, err := filelock.New(v.lockPath)
	if err != nil {
		return err
	}
	defer lock.Close()

	if err := v.reloadLocked(); err != nil {
		return err
	}

	if err := fn(); err != nil {
		return err
	}

	return v.saveLocked()
}

// reloadLocked and saveLocked assume the caller already holds v.mu.

func (v *Vault) reloadLocked() error {
	newData := types.VaultFile{
		Body: make(map[string]json.RawMessage),
	}

	file, err := os.ReadFile(v.file)
	if err != nil {
		if os.IsNotExist(err) {
			v.data = newData
			return nil
		}
		return err
	}

	if len(file) == 0 {
		v.data = newData
		return nil
	}

	data := newData
	if err := json.Unmarshal(file, &data); err != nil {
		return err
	}

	v.data = data
	return nil
}

func (v *Vault) saveLocked() error {
	b, err := json.MarshalIndent(v.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(v.file, b, 0644)
}
