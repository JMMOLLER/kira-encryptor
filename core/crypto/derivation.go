package crypto

import (
	"crypto/sha256"
	"io"

	"github.com/JMMOLLER/kira-encryptor/core/errors"
	"github.com/awnumar/memguard"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/hkdf"
)

func DeriveFileKey(secretKey *memguard.LockedBuffer, salt []byte) (*memguard.LockedBuffer, error) {
	// Derive the file key using HKDF with SHA-256
	reader := hkdf.New(sha256.New, secretKey.Bytes(), salt, []byte("kira-filekey-v2"))

	// Create a locked buffer for the derived file key
	fileKey := memguard.NewBuffer(FILE_KEY_BYTES)

	// Read the derived key into the locked buffer
	_, err := io.ReadFull(reader, fileKey.Bytes())
	if err != nil {
		fileKey.Destroy() // Ensure the buffer is wiped if there's an error
		return nil, &errors.CryptoError{Op: "deriving file key", Err: err}
	}

	return fileKey, nil
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
