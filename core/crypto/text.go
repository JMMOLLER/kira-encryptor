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

func EncryptText(txt string, secretKey *memguard.LockedBuffer, encoding types.BufferEncoding) (string, error) {
	// Create AEAD cipher using the secret key.
	aead, err := chacha20poly1305.NewX(secretKey.Bytes())
	if err != nil {
		return "", &errors.CryptoError{Op: "creating AEAD cipher", Err: err}
	}

	// Convert the plaintext string to bytes.
	txtBytes := []byte(txt)

	// Generate a ciphertext buffer with the appropriate size (nonce + ciphertext + tag).
	cipherText := make([]byte, aead.NonceSize(), aead.NonceSize()+len(txtBytes)+aead.Overhead())
	if _, err := rand.Read(cipherText[:aead.NonceSize()]); err != nil {
		return "", &errors.CryptoError{Op: "generating nonce", Err: err}
	}

	// Encrypt the plaintext using the AEAD cipher.
	cipherText = aead.Seal(cipherText[:aead.NonceSize()], cipherText[:aead.NonceSize()], txtBytes, nil)

	// Encode the ciphertext using the specified encoding.
	var encoded string
	switch encoding {
	case types.BufferEncodingBase64:
		encoded = base64.StdEncoding.EncodeToString(cipherText)
	case types.BufferEncodingBase64URL:
		encoded = base64.URLEncoding.EncodeToString(cipherText)
	case types.BufferEncodingHex:
		encoded = hex.EncodeToString(cipherText)
	default:
		return "", &errors.CryptoError{Op: "encoding ciphertext", Err: errors.ErrInvalidKey}
	}

	return encoded, nil
}

func DecryptText(encryptedText string, secretKey *memguard.LockedBuffer, encoding types.BufferEncoding) (string, error) {
	// Decode the encrypted text based on the specified encoding.
	var cipherText []byte
	var err error
	switch encoding {
	case types.BufferEncodingBase64:
		cipherText, err = base64.StdEncoding.DecodeString(encryptedText)
	case types.BufferEncodingBase64URL:
		cipherText, err = base64.URLEncoding.DecodeString(encryptedText)
	case types.BufferEncodingHex:
		cipherText, err = hex.DecodeString(encryptedText)
	default:
		return "", &errors.CryptoError{Op: "decoding ciphertext", Err: errors.ErrInvalidKey}
	}
	if err != nil {
		return "", &errors.CryptoError{Op: "decoding ciphertext", Err: err}
	}

	// Initialize the AEAD cipher with the secret key.
	aead, err := chacha20poly1305.NewX(secretKey.Bytes())
	if err != nil {
		return "", &errors.CryptoError{Op: "initializing AEAD cipher", Err: err}
	}

	// Ensure the ciphertext is long enough to contain the nonce and tag.
	if len(cipherText) < aead.NonceSize() {
		return "", &errors.CryptoError{Op: "validating ciphertext length", Err: errors.ErrInvalidKey}
	}

	// Decrypt the ciphertext using the AEAD cipher.
	plainText, err := aead.Open(nil, cipherText[:aead.NonceSize()], cipherText[aead.NonceSize():], nil)
	if err != nil {
		return "", &errors.CryptoError{Op: "decrypting ciphertext", Err: err}
	}

	return string(plainText), nil
}
