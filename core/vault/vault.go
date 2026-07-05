// Package vault stores an encrypted Kira vault as a single binary file.
//
// Layout:
//
//	MAGIC | VERSION | HEADER LEN | HEADER | ENCRYPTED BODY
//
// The header contains only the metadata required to derive and verify the
// encryption key. All vault contents remain encrypted inside the body.
package vault

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/JMMOLLER/kira-encryptor/core/crypto"
	"github.com/JMMOLLER/kira-encryptor/core/internal/filelock"
	"github.com/JMMOLLER/kira-encryptor/core/internal/movefile"
	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
)

const (
	vaultFormatVersion = byte(0x01)
	vaultHeaderLenSize = 4
)

// Identifies the Kira vault file format.
var vaultMagic = [4]byte{'A', 'K', 'R', 'V'}

var ErrInvalidPassword = errors.New("vault: invalid password")

type Vault struct {
	file     string
	lockPath string
	mu       sync.RWMutex
	data     types.VaultFile

	// Password-derived master key.
	masterKey *memguard.LockedBuffer

	// Dedicated key used to encrypt the vault body.
	vaultKey *memguard.LockedBuffer
}

// New opens an existing vault or creates a new one using the provided password.
func New(password *memguard.LockedBuffer, file string) (*Vault, error) {
	if password == nil {
		return nil, errors.New("vault: password is required")
	}

	v := &Vault{
		file:     file,
		lockPath: file + ".lock",
	}

	lock, err := filelock.New(v.lockPath)
	if err != nil {
		return nil, err
	}
	defer lock.Close()

	if err := v.openLocked(password); err != nil {
		return nil, err
	}

	return v, nil
}

// MasterKey returns the unlocked master key.
func (v *Vault) MasterKey() *memguard.LockedBuffer {
	return v.masterKey
}

func (v *Vault) GetHeader() *types.VaultHeader {
	v.mu.RLock()
	defer v.mu.RUnlock()

	return v.data.Header
}

// Set stores a single key-value pair.
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

// SetMany stores multiple entries atomically.
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

// Clear removes all entries.
func (v *Vault) Clear() error {
	return v.withFileLock(func() error {
		v.data.Body = make(map[string]json.RawMessage)
		return nil
	})
}

// Refresh reloads the vault from disk.
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

// Executes a read-modify-write operation under the process-wide file lock.
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

// Initializes the vault from disk using the supplied password.
func (v *Vault) openLocked(password *memguard.LockedBuffer) error {
	raw, err := os.ReadFile(v.file)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("vault: reading file: %w", err)
	}

	var header *types.VaultHeader
	var cipherBody []byte

	if len(raw) > 0 {
		header, cipherBody, err = decodeVaultFile(raw)
		if err != nil {
			return fmt.Errorf("vault: decoding file: %w", err)
		}
	}

	isNew := header == nil
	if isNew {
		salt, err := crypto.GenerateSalt()
		if err != nil {
			return fmt.Errorf("vault: generating salt: %w", err)
		}
		header = &types.VaultHeader{
			Kdf:      types.HKDF_Sha256,
			Salt:     salt,
			Opslimit: crypto.OPS_LIMIT,
			Memlimit: crypto.MEM_LIMIT,
		}
	}

	// Derive and verify the master key using the stored header.
	result, err := crypto.GenerateKey(password, *header)
	if err != nil {
		if errors.Is(err, crypto.ErrInvalidPassword) {
			return ErrInvalidPassword
		}
		return fmt.Errorf("vault: generating key: %w", err)
	}
	header.Verifier = result.KeyVerifier

	vaultKey, err := crypto.DeriveVaultKey(result.Key, header.Salt)
	if err != nil {
		result.Key.Destroy()
		return fmt.Errorf("vault: deriving vault key: %w", err)
	}

	v.masterKey = result.Key
	v.vaultKey = vaultKey

	body, err := v.decryptBody(cipherBody)
	if err != nil {
		v.masterKey.Destroy()
		v.vaultKey.Destroy()
		return err
	}

	v.data = types.VaultFile{Header: header, Body: body}

	if isNew {
		// Persist immediately so the verifier and header are on disk
		// before any Set/Get is attempted, and so an empty vault still
		// produces a valid .bin file on first open.
		return v.saveLocked()
	}

	return nil
}

//===============================
// 			Internal helpers
//===============================

func (v *Vault) reloadLocked() error {
	raw, err := os.ReadFile(v.file)
	if err != nil {
		if os.IsNotExist(err) {
			v.data.Body = make(map[string]json.RawMessage)
			return nil
		}
		return fmt.Errorf("vault: reading file: %w", err)
	}

	if len(raw) == 0 {
		v.data.Body = make(map[string]json.RawMessage)
		return nil
	}

	header, cipherBody, err := decodeVaultFile(raw)
	if err != nil {
		return fmt.Errorf("vault: decoding file: %w", err)
	}

	body, err := v.decryptBody(cipherBody)
	if err != nil {
		return err
	}

	v.data = types.VaultFile{Header: header, Body: body}
	return nil
}

func (v *Vault) saveLocked() error {
	plain, err := json.Marshal(v.data.Body)
	if err != nil {
		return fmt.Errorf("vault: marshaling body: %w", err)
	}

	cipherBody, err := crypto.EncryptBytes(plain, v.vaultKey, types.BufferEncodingBase64URL)
	if err != nil {
		return fmt.Errorf("vault: encrypting body: %w", err)
	}

	out, err := encodeVaultFile(v.data.Header, cipherBody)
	if err != nil {
		return err
	}

	// Persist through a temporary file to avoid partial writes.
	tmp := v.file + ".tmp"
	if err := os.WriteFile(tmp, out, 0600); err != nil {
		return fmt.Errorf("vault: writing temp file: %w", err)
	}

	if err := movefile.MoveFile(tmp, v.file); err != nil {
		return fmt.Errorf("vault: committing file: %w", err)
	}

	return nil
}

// Decrypts the vault body.
func (v *Vault) decryptBody(cipherBody []byte) (map[string]json.RawMessage, error) {
	body := make(map[string]json.RawMessage)
	if len(cipherBody) == 0 {
		return body, nil
	}

	plain, err := crypto.DecryptBytes(cipherBody, v.vaultKey, types.BufferEncodingBase64URL)
	if err != nil {
		return nil, fmt.Errorf("vault: decrypting body: %w", err)
	}

	if err := json.Unmarshal(plain, &body); err != nil {
		return nil, fmt.Errorf("vault: parsing body: %w", err)
	}

	return body, nil
}

// Parses the vault file format.
func decodeVaultFile(raw []byte) (*types.VaultHeader, []byte, error) {
	minLen := len(vaultMagic) + 1 + vaultHeaderLenSize
	if len(raw) < minLen {
		return nil, nil, errors.New("file too short")
	}

	offset := 0

	if !bytes.Equal(raw[:len(vaultMagic)], vaultMagic[:]) {
		return nil, nil, errors.New("invalid vault magic")
	}
	offset += len(vaultMagic)

	version := raw[offset]
	offset++
	if version != vaultFormatVersion {
		return nil, nil, fmt.Errorf("unsupported vault format version: %d", version)
	}

	headerLen := binary.BigEndian.Uint32(raw[offset : offset+vaultHeaderLenSize])
	offset += vaultHeaderLenSize

	if len(raw) < offset+int(headerLen) {
		return nil, nil, errors.New("truncated vault header")
	}
	headerBytes := raw[offset : offset+int(headerLen)]
	offset += int(headerLen)

	var header types.VaultHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, nil, fmt.Errorf("unmarshaling header: %w", err)
	}

	return &header, raw[offset:], nil
}

// Encodes the vault into its on-disk representation.
func encodeVaultFile(header *types.VaultHeader, cipherBody []byte) ([]byte, error) {
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return nil, fmt.Errorf("vault: marshaling header: %w", err)
	}

	out := make([]byte, 0, len(vaultMagic)+1+vaultHeaderLenSize+len(headerBytes)+len(cipherBody))
	out = append(out, vaultMagic[:]...)
	out = append(out, vaultFormatVersion)

	lenBuf := make([]byte, vaultHeaderLenSize)
	binary.BigEndian.PutUint32(lenBuf, uint32(len(headerBytes)))
	out = append(out, lenBuf...)

	out = append(out, headerBytes...)
	out = append(out, cipherBody...)

	return out, nil
}
