package crypto

import (
	"testing"

	"github.com/awnumar/memguard"
)

func TestDerivation(t *testing.T) {
	// 1. Initial setup and cleanup
	defer memguard.Purge() // Ensure all locked buffers are wiped after the test

	// 2. Define a fixed secret key and salt for testing
	secretKey := memguard.NewBufferFromBytes([]byte("my_secret_key_1234567890123456")) // 32 bytes secret key
	defer secretKey.Destroy()
	salt := []byte("12345678901234567890123456789012") // 32 bytes salt

	// 3. Test DeriveFileKey
	fileKey, err := DeriveFileKey(secretKey, salt)
	if err != nil {
		t.Fatalf("DeriveFileKey failed: %v", err)
	}
	if len(fileKey.Bytes()) != FILE_KEY_BYTES {
		t.Fatalf("Expected file key length of %d, got %d", FILE_KEY_BYTES, len(fileKey.Bytes()))
	}
	defer fileKey.Destroy() // Ensure the file key buffer is wiped after the test

	// 4. Test DerivePasswordKey
	password := memguard.NewBufferFromBytes([]byte("my_secure_password"))
	defer password.Destroy()
	derivedKey, err := DerivePasswordKey(password, salt, OPS_LIMIT, MEM_LIMIT)
	if err != nil {
		t.Fatalf("DerivePasswordKey failed: %v", err)
	}
	if len(derivedKey.Bytes()) != SECRET_KEY_BYTES {
		t.Fatalf("Expected derived key length of %d, got %d", SECRET_KEY_BYTES, len(derivedKey.Bytes()))
	}
	defer derivedKey.Destroy() // Ensure the derived key buffer is wiped after the test
}
