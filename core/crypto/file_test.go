package crypto

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/awnumar/memguard"
)

func TestEncryptDecryptFile(t *testing.T) {
	// 1. Crear un archivo de entrada temporal con contenido binario real.
	tmpDir := t.TempDir()
	inputFilePath := filepath.Join(tmpDir, "input.bin")
	encryptedPath := filepath.Join(tmpDir, "input.kira")
	decryptedPath := filepath.Join(tmpDir, "input.dec")

	original := bytes.Repeat([]byte("kira-encryptor-core"), 1024)
	if err := os.WriteFile(inputFilePath, original, 0o600); err != nil {
		t.Fatalf("No se pudo crear el archivo de prueba: %v", err)
	}

	// 2. Limpieza al terminar.
	defer memguard.Purge()
	defer os.Remove(inputFilePath)
	defer os.Remove(encryptedPath)
	defer os.Remove(decryptedPath)

	// 3. Crear clave secreta de prueba
	secretKey := memguard.NewBufferFromBytes([]byte("super-secret-key-32-bytes-long!!"))
	defer secretKey.Destroy()

	// 4. Test de Encriptación
	optsEncrypt := FileEncryptionOptions{
		FilePath:   inputFilePath,
		TempPath:   encryptedPath,
		SecretKey:  secretKey,
		OnProgress: nil,
	}

	ctx := context.Background()
	if err := EncryptFile(ctx, optsEncrypt); err != nil {
		t.Fatalf("EncryptFile falló: %v", err)
	}

	// 5. Test de Desencriptación
	optsDecrypt := FileDecryptionOptions{
		FilePath:   encryptedPath,
		TempPath:   decryptedPath,
		SecretKey:  secretKey,
		OnProgress: nil,
	}

	if err := DecryptFile(ctx, optsDecrypt); err != nil {
		t.Fatalf("DecryptFile falló: %v", err)
	}

	// 6. Verificación: ¿El archivo descifrado es igual al original?
	originalData, err := os.ReadFile(inputFilePath)
	if err != nil {
		t.Fatalf("No se pudo leer el archivo original para comparar: %v", err)
	}

	decryptedData, err := os.ReadFile(decryptedPath)
	if err != nil {
		t.Fatalf("No se pudo leer el archivo descifrado para comparar: %v", err)
	}

	if !bytes.Equal(originalData, decryptedData) {
		t.Fatal("El archivo descifrado NO coincide con el archivo original.")
	}
}

// Ensure that progress reporting is cumulative and never frozen or backward.
func TestEncryptFileProgressIsCumulative(t *testing.T) {
	tmpDir := t.TempDir()
	inputFilePath := filepath.Join(tmpDir, "input.bin")
	encryptedPath := filepath.Join(tmpDir, "input.kira")

	// Create a file larger than CHUNK_SIZE to ensure multiple progress callbacks.
	fileSize := CHUNK_SIZE*3 + 12345
	original := bytes.Repeat([]byte{0xAB}, fileSize)
	if err := os.WriteFile(inputFilePath, original, 0o600); err != nil {
		t.Fatalf("No se pudo crear el archivo de prueba: %v", err)
	}
	defer os.Remove(inputFilePath)
	defer os.Remove(encryptedPath)

	secretKey := memguard.NewBufferFromBytes([]byte("super-secret-key-32-bytes-long!!"))
	defer secretKey.Destroy()
	defer memguard.Purge()

	var reported []int64
	var lastTotal int64
	if err := EncryptFile(context.Background(), FileEncryptionOptions{
		FilePath:  inputFilePath,
		TempPath:  encryptedPath,
		SecretKey: secretKey,
		OnProgress: func(processed, total int64) {
			reported = append(reported, processed)
			lastTotal = total
		},
	}); err != nil {
		t.Fatalf("EncryptFile falló: %v", err)
	}

	if len(reported) < 2 {
		t.Fatalf("expected multiple progress callbacks for a %d-byte file, got %d", fileSize, len(reported))
	}

	if lastTotal != int64(fileSize) {
		t.Fatalf("expected total to equal file size %d, got %d", fileSize, lastTotal)
	}

	// Progress should always increase, never freeze or go backward.
	for i := 1; i < len(reported); i++ {
		if reported[i] <= reported[i-1] {
			t.Fatalf("progress did not increase: reported[%d]=%d, reported[%d]=%d", i-1, reported[i-1], i, reported[i])
		}
	}

	// The final callback must report the full file size, not a single
	// chunk's worth of bytes.
	if got := reported[len(reported)-1]; got != int64(fileSize) {
		t.Fatalf("expected final progress to equal file size %d, got %d", fileSize, got)
	}
}
