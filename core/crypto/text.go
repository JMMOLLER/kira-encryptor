package crypto

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"

	"github.com/JMMOLLER/kira-encryptor/core/errors"
	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
	"golang.org/x/crypto/chacha20poly1305"
)

func EncryptBytes(content []byte, secretKey *memguard.LockedBuffer, encoding types.BufferEncoding) ([]byte, error) {
	// Create AEAD cipher using the secret key.
	aead, err := chacha20poly1305.NewX(secretKey.Bytes())
	if err != nil {
		return nil, &errors.CryptoError{Op: "creating AEAD cipher", Err: err}
	}

	// Generate a ciphertext buffer with the appropriate size (nonce + ciphertext + tag).
	cipherText := make([]byte, aead.NonceSize(), aead.NonceSize()+len(content)+aead.Overhead())
	if _, err := rand.Read(cipherText[:aead.NonceSize()]); err != nil {
		return nil, &errors.CryptoError{Op: "generating nonce", Err: err}
	}

	// Encrypt the plaintext using the AEAD cipher.
	return aead.Seal(cipherText[:aead.NonceSize()], cipherText[:aead.NonceSize()], content, nil), nil
}

func DecryptBytes(content []byte, secretKey *memguard.LockedBuffer, encoding types.BufferEncoding) ([]byte, error) {
	// Initialize the AEAD cipher with the secret key.
	aead, err := chacha20poly1305.NewX(secretKey.Bytes())
	if err != nil {
		return nil, &errors.CryptoError{Op: "initializing AEAD cipher", Err: err}
	}

	// Ensure the ciphertext is long enough to contain the nonce and tag.
	if len(content) < aead.NonceSize() {
		return nil, &errors.CryptoError{Op: "validating ciphertext length", Err: errors.ErrInvalidKey}
	}

	// Decrypt the ciphertext using the AEAD cipher.
	plainText, err := aead.Open(nil, content[:aead.NonceSize()], content[aead.NonceSize():], nil)
	if err != nil {
		return nil, &errors.CryptoError{Op: "decrypting ciphertext", Err: err}
	}

	return plainText, nil
}

func ByteToString(b []byte, encoding types.BufferEncoding) (string, error) {
	// Encode the ciphertext using the specified encoding.
	var encoded string
	switch encoding {
	case types.BufferEncodingBase64URL:
		encoded = base64.URLEncoding.EncodeToString(b)
	case types.BufferEncodingHex:
		encoded = hex.EncodeToString(b)
	default:
		return "", &errors.CryptoError{Op: "encoding string", Err: errors.ErrInvalidKey}
	}
	return encoded, nil
}

func StringToByte(s string, encoding types.BufferEncoding) ([]byte, error) {
	// Decode the string based on the specified encoding.
	var decoded []byte
	var err error
	switch encoding {
	case types.BufferEncodingBase64URL:
		decoded, err = base64.URLEncoding.DecodeString(s)
	case types.BufferEncodingHex:
		decoded, err = hex.DecodeString(s)
	default:
		return nil, &errors.CryptoError{Op: "decoding string", Err: errors.ErrInvalidKey}
	}
	if err != nil {
		return nil, &errors.CryptoError{Op: "decoding string", Err: err}
	}
	return decoded, nil
}
