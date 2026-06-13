package crypto

import (
	"testing"

	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
)

func TestGenerateKey(t *testing.T) {
	// 1. Initial setup and cleanup
	defer memguard.Purge() // Ensure all locked buffers are wiped after the test

	// 2. Define a fixed password and header for testing
	header := types.StorageHeader{
		Kdf:      "argon2id",
		Memlimit: MEM_LIMIT,
		Opslimit: OPS_LIMIT,
		Salt:     []byte("12345678901234567890123456789012"), // 32 bytes salt
	}
	password := memguard.NewBufferFromBytes([]byte("my_secure_password"))
	defer password.Destroy() // Ensure the password buffer is wiped after use

	// 3. Generate the key
	result, err := GenerateKey(password, header)
	if err != nil {
		t.Fatalf("GenerateKey failed: %v", err)
	}
	defer result.Key.Destroy() // Ensure the derived key buffer is wiped after the test
	defer memguard.WipeBytes(result.KeyVerifier) // Ensure the key verifier is wiped after the test

	// 4. Validate the generated key and verifier
	if len(result.Key.Bytes()) != SECRET_KEY_BYTES {
		t.Fatalf("Expected derived key length of %d, got %d", SECRET_KEY_BYTES, len(result.Key.Bytes()))
	}

	if len(result.KeyVerifier) != SECRET_KEY_BYTES {
		t.Fatalf("Expected key verifier length of %d, got %d", SECRET_KEY_BYTES, len(result.KeyVerifier))
	}

	// 5. Check the verifier with the correct password
	isValid := checkVerifier(result.Key, header.Salt, result.KeyVerifier)
	if !isValid {
		t.Fatal("Verifier check failed with correct password")
	}
}