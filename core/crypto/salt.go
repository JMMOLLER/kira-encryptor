package crypto

import (
	"crypto/rand"

	"github.com/JMMOLLER/kira-encryptor/core/errors"
)

// GenerateSalt creates a new random salt of the specified length.
func GenerateSalt() ([]byte, error) {
	salt := make([]byte, SALT_BYTES)
	if _, err := rand.Read(salt); err != nil {
		return nil, &errors.CryptoError{Op: "generating salt", Err: err}
	}
	return salt, nil
}
