package vault

import (
	"os"
	"path/filepath"
	"testing"
)

func newTestVault(t *testing.T) *Vault {
	t.Helper()

	file := filepath.Join(t.TempDir(), "vault.json")

	db, err := New(file)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	return db
}

func TestSetAndGet(t *testing.T) {
	db := newTestVault(t)

	input := map[string]any{
		"name":     "Jhon Doe",
		"age":      22,
		"verified": true,
	}

	if err := db.Set("user", input); err != nil {
		t.Fatalf("Set() error = %v", err)
	}

	var output map[string]any

	if err := db.Get("user", &output); err != nil {
		t.Fatalf("Get() error = %v", err)
	}

	if output["name"] != "Jhon Doe" {
		t.Errorf("expected name Jhon Doe, got %v", output["name"])
	}

	if output["verified"] != true {
		t.Errorf("expected verified true")
	}

	if output["age"].(float64) != 22 {
		t.Errorf("expected age 22")
	}
}

func TestExists(t *testing.T) {
	db := newTestVault(t)

	if db.Exists("foo") {
		t.Fatal("key should not exist")
	}

	if err := db.Set("foo", "bar"); err != nil {
		t.Fatal(err)
	}

	if !db.Exists("foo") {
		t.Fatal("key should exist")
	}
}

func TestDelete(t *testing.T) {
	db := newTestVault(t)

	db.Set("foo", "bar")

	if err := db.Delete("foo"); err != nil {
		t.Fatal(err)
	}

	if db.Exists("foo") {
		t.Fatal("key should have been deleted")
	}
}

func TestKeys(t *testing.T) {
	db := newTestVault(t)

	db.Set("a", 1)
	db.Set("b", 2)
	db.Set("c", 3)

	keys := db.Keys()

	if len(keys) != 3 {
		t.Fatalf("expected 3 keys, got %d", len(keys))
	}

	found := map[string]bool{}

	for _, k := range keys {
		found[k] = true
	}

	for _, k := range []string{"a", "b", "c"} {
		if !found[k] {
			t.Errorf("missing key %s", k)
		}
	}
}

func TestClear(t *testing.T) {
	db := newTestVault(t)

	db.Set("foo", "bar")
	db.Set("hello", "world")

	if err := db.Clear(); err != nil {
		t.Fatal(err)
	}

	if len(db.Keys()) != 0 {
		t.Fatal("vault should be empty")
	}
}

func TestPersistence(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "vault.json")

	db, err := New(file)
	if err != nil {
		t.Fatal(err)
	}

	db.Set("message", "hello")

	db2, err := New(file)
	if err != nil {
		t.Fatal(err)
	}

	var value string

	if err := db2.Get("message", &value); err != nil {
		t.Fatal(err)
	}

	if value != "hello" {
		t.Fatalf("expected hello, got %s", value)
	}
}

func TestGetNotFound(t *testing.T) {
	db := newTestVault(t)

	var value string

	if err := db.Get("missing", &value); err == nil {
		t.Fatal("expected error")
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "vault.json")

	if err := os.WriteFile(file, []byte("{invalid json"), 0644); err != nil {
		t.Fatal(err)
	}

	if _, err := New(file); err == nil {
		t.Fatal("expected error")
	}
}
