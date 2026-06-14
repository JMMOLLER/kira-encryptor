package crypto

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/awnumar/memguard"
)

func TestEncryptDecryptFile(t *testing.T) {
	// 1. Configuración de archivos de prueba
	// Asumimos que tienes un archivo en "testdata/input.txt"
	inputFilePath := filepath.Join("..\\..\\demo\\others\\image.webp")
	encryptedPath := filepath.Join("..\\..\\demo\\others\\image.kira")
	decryptedPath := filepath.Join("..\\..\\demo\\others\\image.dec")

	// Asegurarse de que el archivo de entrada existe para la prueba
	if _, err := os.Stat(inputFilePath); os.IsNotExist(err) {
		t.Fatalf("El archivo de prueba %s no existe. Por favor créalo para ejecutar el test.", inputFilePath)
	}

	// 2. Limpieza al terminar
	defer os.Remove(encryptedPath)
	defer os.Remove(decryptedPath)
	defer memguard.Purge()

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

	if err := EncryptFile(optsEncrypt); err != nil {
		t.Fatalf("EncryptFile falló: %v", err)
	}

	// 5. Test de Desencriptación
	optsDecrypt := FileDecryptionOptions{
		FilePath:   encryptedPath,
		TempPath:   decryptedPath,
		SecretKey:  secretKey,
		OnProgress: nil,
	}

	if err := DecryptFile(optsDecrypt); err != nil {
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