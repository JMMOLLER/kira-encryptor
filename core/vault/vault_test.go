package vault

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/awnumar/memguard"
)

type person struct {
	Name string
	Age  int
}

func testPassword(s string) *memguard.LockedBuffer {
	return memguard.NewBufferFromBytes([]byte(s))
}

func TestSetAndGet(t *testing.T) {
	dir := t.TempDir()

	v, err := New(testPassword("correct-horse"), filepath.Join(dir, "vault.bin"))
	if err != nil {
		t.Fatal(err)
	}

	expected := person{
		Name: "John",
		Age:  30,
	}

	if err := v.Set("user", expected); err != nil {
		t.Fatal(err)
	}

	var got person

	if err := v.Get("user", &got); err != nil {
		t.Fatal(err)
	}

	if got != expected {
		t.Fatalf("expected %+v, got %+v", expected, got)
	}
}

func TestGetNotFound(t *testing.T) {
	dir := t.TempDir()

	v, err := New(testPassword("correct-horse"), filepath.Join(dir, "vault.bin"))
	if err != nil {
		t.Fatal(err)
	}

	var p person

	err = v.Get("missing", &p)

	if err == nil {
		t.Fatal("expected error")
	}
}

func TestDelete(t *testing.T) {
	dir := t.TempDir()

	v, err := New(testPassword("correct-horse"), filepath.Join(dir, "vault.bin"))
	if err != nil {
		t.Fatal(err)
	}

	if err := v.Set("a", 123); err != nil {
		t.Fatal(err)
	}

	if err := v.Delete("a"); err != nil {
		t.Fatal(err)
	}

	if v.Exists("a") {
		t.Fatal("key should not exist")
	}
}

// TestFileIsEncryptedOnDisk ensures the persisted .bin never contains the
// plaintext value or key as a raw substring — i.e. the body actually got
// encrypted rather than json.Marshal'd directly like the old vault.json.
func TestFileIsEncryptedOnDisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vault.bin")

	v, err := New(testPassword("correct-horse"), path)
	if err != nil {
		t.Fatal(err)
	}

	secretMarker := "super-secret-item-name-should-not-appear-in-cleartext"
	if err := v.Set("item-1", secretMarker); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	if !bytes.Equal(raw[:len(vaultMagic)], vaultMagic[:]) {
		t.Fatalf("expected file to start with vault magic, got %v", raw[:len(vaultMagic)])
	}

	if bytes.Contains(raw, []byte(secretMarker)) {
		t.Fatal("plaintext value leaked into the encrypted .bin file")
	}

	if bytes.Contains(raw, []byte("item-1")) {
		t.Fatal("plaintext key leaked into the encrypted .bin file")
	}
}

// TestReopenWithCorrectPassword ensures data written in one session is
// readable (decrypted) in a fresh Vault instance opened with the same
// password.
func TestReopenWithCorrectPassword(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vault.bin")

	v1, err := New(testPassword("correct-horse"), path)
	if err != nil {
		t.Fatal(err)
	}
	if err := v1.Set("user", person{Name: "Ada", Age: 36}); err != nil {
		t.Fatal(err)
	}

	v2, err := New(testPassword("correct-horse"), path)
	if err != nil {
		t.Fatal(err)
	}

	var got person
	if err := v2.Get("user", &got); err != nil {
		t.Fatal(err)
	}

	if got != (person{Name: "Ada", Age: 36}) {
		t.Fatalf("expected persisted data to survive reopen, got %+v", got)
	}
}

// TestReopenWithWrongPassword ensures a wrong password is rejected with
// ErrInvalidPassword instead of silently returning garbage or an empty
// vault.
func TestReopenWithWrongPassword(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vault.bin")

	v1, err := New(testPassword("correct-horse"), path)
	if err != nil {
		t.Fatal(err)
	}
	if err := v1.Set("user", person{Name: "Ada", Age: 36}); err != nil {
		t.Fatal(err)
	}

	_, err = New(testPassword("wrong-password"), path)
	if err == nil {
		t.Fatal("expected error for wrong password")
	}
	if !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("expected ErrInvalidPassword, got %v", err)
	}
}

func TestNewRequiresPassword(t *testing.T) {
	dir := t.TempDir()

	_, err := New(nil, filepath.Join(dir, "vault.bin"))
	if err == nil {
		t.Fatal("expected error when password is nil")
	}
}
