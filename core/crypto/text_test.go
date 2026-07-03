package crypto

import (
	"testing"

	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
)

func TestCryptoText(t *testing.T) {
	// 1. Initial setup and cleanup
	defer memguard.Purge() // Ensure all locked buffers are wiped after the test

	// 2. Define a fixed secret key for testing
	secretKey := memguard.NewBufferFromBytes([]byte("12345678901234567890123456789012")) // 32 bytes key
	defer secretKey.Destroy()                                                            // Ensure the secret key buffer is wiped after use

	// 3. Define a plaintext string to encrypt
	plaintext := "Hello, World! This is a test of XChaCha20-Poly1305 encryption and decryption."

	// 4. Define test cases for different encodings
	testCases := []struct {
		name     string
		encoding types.BufferEncoding
	}{
		{name: "Base64URL Encoding", encoding: types.BufferEncodingBase64URL},
		{name: "Hex Encoding", encoding: types.BufferEncodingHex},
	}

	// 5. Run the test cases
	for _, tc := range testCases {
		// Run each test case as a subtest for better isolation and reporting
		t.Run(tc.name, func(t *testing.T) {

			// A. Encrypt the plaintext
			encryptedText, err := EncryptBytes([]byte(plaintext), secretKey, tc.encoding)
			if err != nil {
				t.Fatalf("EncryptBytes failed: %v", err)
			}

			// B. Decrypt the encrypted text
			decryptedText, err := DecryptBytes(encryptedText, secretKey, tc.encoding)
			if err != nil {
				t.Fatalf("DecryptBytes failed: %v", err)
			}

			// C. Verify the decrypted text matches the original plaintext
			if string(decryptedText) != plaintext {
				t.Fatalf("Decrypted text does not match original plaintext")
			}

		})
	}
}
