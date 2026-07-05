package crypto

import (
	"crypto/sha256"
	"io"

	"github.com/JMMOLLER/kira-encryptor/core/errors"
	"github.com/awnumar/memguard"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/hkdf"
)

// deriveHKDFKey derives a purpose-specific key using HKDF-SHA256.
//
// The info label provides domain separation between derived keys.
func deriveHKDFKey(secretKey *memguard.LockedBuffer, salt []byte, info []byte, op string) (*memguard.LockedBuffer, error) {
	reader := hkdf.New(sha256.New, secretKey.Bytes(), salt, info)

	key := memguard.NewBuffer(FILE_KEY_BYTES)

	if _, err := io.ReadFull(reader, key.Bytes()); err != nil {
		key.Destroy()
		return nil, &errors.CryptoError{Op: op, Err: err}
	}

	return key, nil
}

func DeriveFileKey(secretKey *memguard.LockedBuffer, salt []byte) (*memguard.LockedBuffer, error) {
	return deriveHKDFKey(secretKey, salt, []byte("kira-filekey-v2"), "deriving file key")
}

// DeriveVaultKey derives the key used to encrypt the vault body.
//
// A dedicated HKDF label keeps it independent from per-file keys.
func DeriveVaultKey(secretKey *memguard.LockedBuffer, salt []byte) (*memguard.LockedBuffer, error) {
	return deriveHKDFKey(secretKey, salt, []byte("kira-vaultkey-v1"), "deriving vault key")
}

func DerivePasswordKey(password *memguard.LockedBuffer, salt []byte, ops, mem uint32) (*memguard.LockedBuffer, error) {
	// Create a locked buffer for the derived key
	derivedKey := argon2.IDKey(
		password.Bytes(),
		salt,
		ops,
		mem,
		ARGON2_THREADS,
		SECRET_KEY_BYTES,
	)

	// Move the derived key into a memguard locked buffer for secure handling
	key := memguard.NewBuffer(SECRET_KEY_BYTES)
	key.Move(derivedKey)

	return key, nil
}
