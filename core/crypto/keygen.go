package crypto

import (
	"errors"

	"golang.org/x/crypto/argon2"

	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
)

type Result struct {
	Key         *memguard.LockedBuffer
	KeyVerifier []byte
}

// Returned when the supplied password does not match the stored verifier.
var ErrInvalidPassword = errors.New("invalid password")

// GenerateKey derives the master key and verifies the password when a verifier is present.
func GenerateKey(password *memguard.LockedBuffer, header types.VaultHeader) (*Result, error) {
	// Validate Salt
	if len(header.Salt) != SALT_BYTES {
		return nil, errors.New("invalid salt length in storage header")
	}

	// Security validations
	if header.Opslimit < OPS_LIMIT {
		return nil, errors.New("insecure opslimit")
	}
	if header.Memlimit < MEM_LIMIT {
		return nil, errors.New("insecure memlimit")
	}

	// Create a locked buffer for the derived key
	key := memguard.NewBuffer(SECRET_KEY_BYTES)

	// Derive the key using Argon2id
	derivedKey := argon2.IDKey(
		password.Bytes(),
		header.Salt,
		header.Opslimit,
		header.Memlimit,
		4,
		SECRET_KEY_BYTES,
	)
	key.Move(derivedKey)

	// Generate or verify the key verifier
	var verifier []byte

	if header.Verifier != nil {
		ok := checkVerifier(key, header.Salt, header.Verifier)
		if !ok {
			key.Destroy()
			return nil, ErrInvalidPassword
		}
		verifier = header.Verifier
	} else {
		verifier = generateVerifier(key, header.Salt)
	}

	return &Result{
		Key:         key,
		KeyVerifier: verifier,
	}, nil
}
