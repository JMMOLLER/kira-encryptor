package vault

import (
	"encoding/json"
	"errors"
	"os"
)

type Vault struct {
	file string
	data map[string]json.RawMessage
}

func New(file string) (*Vault, error) {
	v := &Vault{
		file: file,
		data: make(map[string]json.RawMessage),
	}

	if err := v.load(); err != nil {
		return nil, err
	}

	return v, nil
}

func (v *Vault) Set(key string, value any) error {
	bytes, err := json.Marshal(value)
	if err != nil {
		return err
	}

	v.data[key] = bytes

	return v.save()
}

func (v *Vault) Get(key string, dest any) error {
	value, ok := v.data[key]
	if !ok {
		return errors.New("key not found")
	}

	return json.Unmarshal(value, dest)
}

func (v *Vault) Delete(key string) error {
	delete(v.data, key)
	return v.save()
}

func (v *Vault) Exists(key string) bool {
	_, ok := v.data[key]
	return ok
}

func (v *Vault) Keys() []string {
	keys := make([]string, 0, len(v.data))

	for k := range v.data {
		keys = append(keys, k)
	}

	return keys
}

func (v *Vault) Clear() error {
	v.data = make(map[string]json.RawMessage)
	return v.save()
}

func (v *Vault) load() error {
	file, err := os.ReadFile(v.file)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	if len(file) == 0 {
		return nil
	}

	return json.Unmarshal(file, &v.data)
}

func (v *Vault) save() error {
	bytes, err := json.MarshalIndent(v.data, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(v.file, bytes, 0644)
}