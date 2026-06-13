package crypto

import (
	"crypto/subtle"

	"github.com/awnumar/memguard"
	"golang.org/x/crypto/argon2"
)

func generateVerifier(key *memguard.LockedBuffer, salt []byte) []byte {
	sum := argon2.IDKey(
		key.Bytes(),
		salt,
		1,
		MEM_LIMIT,
		1,
		SECRET_KEY_BYTES,
	)

	return sum
}

func checkVerifier(key *memguard.LockedBuffer, salt []byte, verifier []byte) bool {
	actualVerify := generateVerifier(key, salt)
	defer memguard.WipeBytes(actualVerify) // Ensure the generated verifier is wiped after use

	return subtle.ConstantTimeCompare(actualVerify, verifier) == 1
}
