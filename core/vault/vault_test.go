package vault

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"
)

type person struct {
	Name string
	Age  int
}

func TestSetAndGet(t *testing.T) {
	dir := t.TempDir()

	v, err := New(filepath.Join(dir, "vault.json"))
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

	v, err := New(filepath.Join(dir, "vault.json"))
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

	v, err := New(filepath.Join(dir, "vault.json"))
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

func TestClear(t *testing.T) {
	dir := t.TempDir()

	v, err := New(filepath.Join(dir, "vault.json"))
	if err != nil {
		t.Fatal(err)
	}

	_ = v.Set("a", 1)
	_ = v.Set("b", 2)
	_ = v.Set("c", 3)

	if err := v.Clear(); err != nil {
		t.Fatal(err)
	}

	if len(v.Keys()) != 0 {
		t.Fatal("vault should be empty")
	}
}

func TestPersistence(t *testing.T) {
	dir := t.TempDir()

	path := filepath.Join(dir, "vault.json")

	{
		v, err := New(path)
		if err != nil {
			t.Fatal(err)
		}

		if err := v.Set("value", 42); err != nil {
			t.Fatal(err)
		}
	}

	{
		v, err := New(path)
		if err != nil {
			t.Fatal(err)
		}

		var n int

		if err := v.Get("value", &n); err != nil {
			t.Fatal(err)
		}

		if n != 42 {
			t.Fatalf("expected 42, got %d", n)
		}
	}
}

func TestConcurrentSet(t *testing.T) {
	dir := t.TempDir()

	v, err := New(filepath.Join(dir, "vault.json"))
	if err != nil {
		t.Fatal(err)
	}

	const workers = 100

	var wg sync.WaitGroup

	wg.Add(workers)

	for i := range workers {
		go func(i int) {
			defer wg.Done()

			key := fmt.Sprintf("key-%d", i)

			if err := v.Set(key, i); err != nil {
				t.Error(err)
			}
		}(i)
	}

	wg.Wait()

	for i := range workers {
		var n int

		key := fmt.Sprintf("key-%d", i)

		if err := v.Get(key, &n); err != nil {
			t.Fatalf("missing key %s", key)
		}

		if n != i {
			t.Fatalf("expected %d, got %d", i, n)
		}
	}
}

func TestConcurrentReaders(t *testing.T) {
	dir := t.TempDir()

	v, err := New(filepath.Join(dir, "vault.json"))
	if err != nil {
		t.Fatal(err)
	}

	if err := v.Set("number", 100); err != nil {
		t.Fatal(err)
	}

	const readers = 100

	var wg sync.WaitGroup

	wg.Add(readers)

	for range readers {
		go func() {
			defer wg.Done()

			var n int

			if err := v.Get("number", &n); err != nil {
				t.Error(err)
				return
			}

			if n != 100 {
				t.Errorf("expected 100 got %d", n)
			}
		}()
	}

	wg.Wait()
}

func TestTwoInstancesShareSameFile(t *testing.T) {
	dir := t.TempDir()

	path := filepath.Join(dir, "vault.json")

	v1, err := New(path)
	if err != nil {
		t.Fatal(err)
	}

	v2, err := New(path)
	if err != nil {
		t.Fatal(err)
	}

	if err := v1.Set("a", 1); err != nil {
		t.Fatal(err)
	}

	if err := v2.Refresh(); err != nil {
		t.Fatal(err)
	}

	var n int

	if err := v2.Get("a", &n); err != nil {
		t.Fatal(err)
	}

	if n != 1 {
		t.Fatalf("expected 1 got %d", n)
	}
}

func TestSetMany(t *testing.T) {
	dir := t.TempDir()

	v, err := New(filepath.Join(dir, "vault.json"))
	if err != nil {
		t.Fatal(err)
	}

	values := map[string]any{
		"a": 1,
		"b": 2,
		"c": 3,
	}

	if err := v.SetMany(values); err != nil {
		t.Fatal(err)
	}

	for k, expected := range map[string]int{
		"a": 1,
		"b": 2,
		"c": 3,
	} {
		var got int

		if err := v.Get(k, &got); err != nil {
			t.Fatal(err)
		}

		if got != expected {
			t.Fatalf("%s expected %d got %d", k, expected, got)
		}
	}
}

// Run with `go test -race` to check for race conditions
func TestConcurrentReadWrite(t *testing.T) {
	dir := t.TempDir()

	v, err := New(filepath.Join(dir, "vault.json"))
	if err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup

	for i := range 50 {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			key := fmt.Sprintf("k%d", i)

			for j := range 100 {
				_ = v.Set(key, j)
			}
		}(i)
	}

	for i := range 50 {
		wg.Add(1)

		go func(i int) {
			defer wg.Done()

			key := fmt.Sprintf("k%d", i)

			for range 100 {
				var x int
				_ = v.Get(key, &x)
			}
		}(i)
	}

	wg.Wait()
}
