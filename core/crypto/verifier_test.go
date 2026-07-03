package crypto

import (
	"testing"

	"github.com/awnumar/memguard"
)

func TestVerifier(t *testing.T) {
	// 1. Initial setup and cleanup
	defer memguard.Purge() // Ensure all locked buffers are wiped after the test

	// 2. Define a fixed salt and password for testing
	salt := []byte("12345678901234567890123456789012") // 32 bytes salt
	password := memguard.NewBufferFromBytes([]byte("my_secure_password"))
	defer password.Destroy() // Ensure the password buffer is wiped after use

	// 3. Generate the verifier
	verifier := generateVerifier(password, salt)
	if len(verifier) != SECRET_KEY_BYTES {
		t.Fatalf("Expected verifier length of %d, got %d", SECRET_KEY_BYTES, len(verifier))
	}
	defer memguard.WipeBytes(verifier) // Ensure the verifier is wiped after the test

	// 4. Check the verifier with the correct password
	isValid := checkVerifier(password, salt, verifier)
	if !isValid {
		t.Fatal("Verifier check failed with correct password")
	}

	// 5. Check the verifier with an incorrect password
	wrongPassword := memguard.NewBufferFromBytes([]byte("wrong_password"))
	defer wrongPassword.Destroy() // Ensure the wrong password buffer is wiped after use
	isValid = checkVerifier(wrongPassword, salt, verifier)
	if isValid {
		t.Fatal("Verifier check passed with incorrect password")
	}
}
