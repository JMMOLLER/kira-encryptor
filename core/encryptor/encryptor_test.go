package encryptor

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/JMMOLLER/kira-encryptor/core/crypto"
	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
)

func mustWriteFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

// Ensures original and encrypted trees remain fully separated when encryption
// is configured to preserve inputs.
func TestEncryptFolderKeepsOriginalsSeparate(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "demo")
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0755); err != nil {
		t.Fatal(err)
	}
	mustWriteFile(t, filepath.Join(root, "a.txt"), "hello a")
	mustWriteFile(t, filepath.Join(root, "sub", "b.txt"), "hello b")

	key := memguard.NewBufferFromBytes([]byte("pw"))
	enc, err := New(key, types.EncryptorOptions{DBPath: filepath.Join(dir, "vault.bin")})
	if err != nil {
		t.Fatal(err)
	}

	deleteFalse := false
	if _, err := enc.EncryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath:  root,
		DeleteOnEnd: &deleteFalse,
	}); err != nil {
		t.Fatal(err)
	}

	// Original tree must remain intact.
	if _, err := os.Stat(filepath.Join(root, "a.txt")); err != nil {
		t.Fatalf("original file missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "sub", "b.txt")); err != nil {
		t.Fatalf("original nested file missing: %v", err)
	}

	// Exactly one encrypted sibling directory must exist.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	var encryptedDir string
	count := 0
	for _, e := range entries {
		if e.IsDir() && e.Name() != "demo" {
			count++
			encryptedDir = filepath.Join(dir, e.Name())
		}
	}
	if count != 1 {
		t.Fatalf("expected one encrypted sibling directory, got %d", count)
	}

	// Encrypted tree must contain no plaintext artifacts.
	var plaintextLeaked bool
	_ = filepath.WalkDir(encryptedDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if filepath.Ext(path) != crypto.FILE_EXTENSION {
			plaintextLeaked = true
		}
		return nil
	})
	if plaintextLeaked {
		t.Fatal("plaintext leakage detected in encrypted tree")
	}

	// Original tree must not contain ciphertext artifacts.
	var ciphertextLeaked bool
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if filepath.Ext(path) == crypto.FILE_EXTENSION {
			ciphertextLeaked = true
		}
		return nil
	})
	if ciphertextLeaked {
		t.Fatal("ciphertext leakage detected in plaintext tree")
	}
}

// Validates in-place encryption mode where the original directory is replaced.
func TestEncryptFolderDeleteOnEndTrue(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "demo")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	mustWriteFile(t, filepath.Join(root, "a.txt"), "hello a")

	key := memguard.NewBufferFromBytes([]byte("pw"))
	enc, err := New(key, types.EncryptorOptions{DBPath: filepath.Join(dir, "vault.bin")})
	if err != nil {
		t.Fatal(err)
	}

	result, err := enc.EncryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath: root,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.RootID == "" {
		t.Fatal("expected a non-empty RootID")
	}

	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatalf("expected root to be replaced, got: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	dirCount := 0
	for _, e := range entries {
		if e.IsDir() {
			dirCount++
		}
	}
	if dirCount != 1 {
		t.Fatalf("expected single encrypted directory, got %d", dirCount)
	}
}

// Ensures decrypt creates a sibling plaintext tree without modifying ciphertext.
func TestDecryptFolderKeepsCiphertextSeparate(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "demo")
	if err := os.MkdirAll(filepath.Join(root, "sub"), 0755); err != nil {
		t.Fatal(err)
	}
	mustWriteFile(t, filepath.Join(root, "a.txt"), "hello a")
	mustWriteFile(t, filepath.Join(root, "sub", "b.txt"), "hello b")

	key := memguard.NewBufferFromBytes([]byte("pw"))
	enc, err := New(key, types.EncryptorOptions{DBPath: filepath.Join(dir, "vault.bin")})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := enc.EncryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath: root,
	}); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	var encryptedDir string
	for _, e := range entries {
		if e.IsDir() {
			encryptedDir = filepath.Join(dir, e.Name())
		}
	}
	if encryptedDir == "" {
		t.Fatal("encrypted folder not found")
	}

	deleteFalse := false
	decryptResult, err := enc.DecryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath:  encryptedDir,
		DeleteOnEnd: &deleteFalse,
	})
	if err != nil {
		t.Fatal(err)
	}
	if decryptResult.OutputPath == "" {
		t.Fatal("expected a non-empty OutputPath")
	}

	if _, err := os.Stat(encryptedDir); err != nil {
		t.Fatalf("ciphertext directory missing: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dir, "demo", "a.txt")); err != nil {
		t.Fatalf("missing decrypted file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "demo", "sub", "b.txt")); err != nil {
		t.Fatalf("missing decrypted nested file: %v", err)
	}

	var ciphertextLeaked bool
	_ = filepath.WalkDir(filepath.Join(dir, "demo"), func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if filepath.Ext(path) == crypto.FILE_EXTENSION {
			ciphertextLeaked = true
		}
		return nil
	})
	if ciphertextLeaked {
		t.Fatal("ciphertext leakage detected in decrypted output")
	}

	rootID := filepath.Base(encryptedDir)
	var item types.VaultItem
	if err := enc.vault.Get(rootID, &item); err != nil {
		t.Fatalf("expected vault entry to exist: %v", err)
	}
}

// Reproduces a regression where DecryptFile would report progress frozen at the
// size of the first chunk instead of a cumulative total.
func TestEncryptFolderReportsRealProgress(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "demo")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}

	// Large enough to span several CHUNK_SIZE-sized reads.
	fileSize := crypto.CHUNK_SIZE*4 + 4321
	data := make([]byte, fileSize)
	for i := range data {
		data[i] = byte(i % 251)
	}
	if err := os.WriteFile(filepath.Join(root, "big.bin"), data, 0644); err != nil {
		t.Fatal(err)
	}

	key := memguard.NewBufferFromBytes([]byte("pw"))
	enc, err := New(key, types.EncryptorOptions{DBPath: filepath.Join(dir, "vault.bin")})
	if err != nil {
		t.Fatal(err)
	}

	var reported []int64
	var lastTotal int64
	if _, err := enc.EncryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath: root,
		OnProgress: func(done, total int64) {
			reported = append(reported, done)
			lastTotal = total
		},
	}); err != nil {
		t.Fatal(err)
	}

	if len(reported) < 2 {
		t.Fatalf("expected multiple progress callbacks for a %d-byte file, got %d", fileSize, len(reported))
	}
	if lastTotal != int64(fileSize) {
		t.Fatalf("expected total bytes to equal file size %d, got %d", fileSize, lastTotal)
	}

	// The bug reported progress freezing at (or oscillating around) the
	// size of the first chunk. Verify the final reported value actually
	// reaches the true total instead of staying stuck near one chunk.
	final := reported[len(reported)-1]
	if final != int64(fileSize) {
		t.Fatalf("expected final progress to reach %d (full file), got %d — progress looks frozen", fileSize, final)
	}

	// And progress must never go backward between callbacks.
	for i := 1; i < len(reported); i++ {
		if reported[i] < reported[i-1] {
			t.Fatalf("progress went backward: reported[%d]=%d, reported[%d]=%d", i-1, reported[i-1], i, reported[i])
		}
	}
}

// Ensures EncryptFolder places output under a custom DestPath while keeping
// the ID-based naming, and DecryptFolder mirrors that for its own DestPath.
func TestFolderOperationsRespectDestPath(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "demo")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	mustWriteFile(t, filepath.Join(root, "a.txt"), "hello a")

	encDest := filepath.Join(dir, "enc-out")
	decDest := filepath.Join(dir, "dec-out")

	key := memguard.NewBufferFromBytes([]byte("pw"))
	enc, err := New(key, types.EncryptorOptions{DBPath: filepath.Join(dir, "vault.bin")})
	if err != nil {
		t.Fatal(err)
	}

	encResult, err := enc.EncryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath: root,
		DestPath:   encDest,
	})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(encResult.OutputPath) != encDest {
		t.Fatalf("expected output under %q, got %q", encDest, encResult.OutputPath)
	}
	if filepath.Base(encResult.OutputPath) != encResult.RootID {
		t.Fatalf("expected output folder named after RootID, got %q", encResult.OutputPath)
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatalf("expected original root to be gone, got: %v", err)
	}

	decResult, err := enc.DecryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath: encResult.OutputPath,
		DestPath:   decDest,
	})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(decResult.OutputPath) != decDest {
		t.Fatalf("expected decrypted output under %q, got %q", decDest, decResult.OutputPath)
	}
	if _, err := os.Stat(filepath.Join(decResult.OutputPath, "a.txt")); err != nil {
		t.Fatalf("missing decrypted file: %v", err)
	}
}

// A DestPath inside the source tree must be rejected outright.
func TestEncryptFolderRejectsNestedDestPath(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "demo")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	mustWriteFile(t, filepath.Join(root, "a.txt"), "hello a")

	key := memguard.NewBufferFromBytes([]byte("pw"))
	enc, err := New(key, types.EncryptorOptions{DBPath: filepath.Join(dir, "vault.bin")})
	if err != nil {
		t.Fatal(err)
	}

	_, err = enc.EncryptFolder(context.Background(), types.FolderOperationOptions{
		FolderPath: root,
		DestPath:   filepath.Join(root, "nested"),
	})
	if err == nil {
		t.Fatal("expected an error for a DestPath nested inside the source folder")
	}
}
