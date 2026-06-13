package crypto

import (
	"crypto/sha256"
	"io"

	"github.com/awnumar/memguard"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/hkdf"
)

func DeriveFileKey(secretKey *memguard.LockedBuffer, salt []byte) (*memguard.LockedBuffer, error) {
	// Derive the file key using HKDF with SHA-256
	hkdf := hkdf.New(sha256.New, secretKey.Bytes(), salt, []byte("kira-filekey-v2"))

	// Create a locked buffer for the derived file key
	fileKey := memguard.NewBuffer(FILE_KEY_BYTES)

	// Read the derived key into the locked buffer
	_, err := io.ReadFull(hkdf, fileKey.Bytes())
	if err != nil {
		fileKey.Destroy() // Ensure the buffer is wiped if there's an error
		return nil, err
	}

	return fileKey, nil
}

func DerivePasswordKey(password *memguard.LockedBuffer, salt []byte, opsLimit uint32, memLimit uint32) *memguard.LockedBuffer {
	key := memguard.NewBuffer(SECRET_KEY_BYTES)

	derivedKey := argon2.IDKey(
		password.Bytes(),
		salt,
		opsLimit,
		memLimit,
		4,
		SECRET_KEY_BYTES,
	)
	key.Move(derivedKey)
	
	return key
}
