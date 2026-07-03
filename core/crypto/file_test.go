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
