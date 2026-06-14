package crypto

import (
	"crypto/rand"

	"github.com/JMMOLLER/kira-encryptor/core/errors"
	"golang.org/x/crypto/chacha20poly1305"
)

func generateNonce() ([]byte, error) {
	nonce := make([]byte, chacha20poly1305.NonceSizeX) // ChaCha20-Poly1305 nonce size
	if _, err := rand.Read(nonce); err != nil {
		return nil, &errors.CryptoError{Op: "generating nonce", Err: err}
	}
	return nonce, nil
}
