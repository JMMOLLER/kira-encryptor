package types

import (
	"encoding/json"
	"time"

	"github.com/awnumar/memguard"
)

// Represents the various buffer encodings supported.
type BufferEncoding string

const (
	BufferEncodingBase64URL BufferEncoding = "base64url"
	BufferEncodingHex       BufferEncoding = "hex"
)

// Represents the different key derivation function types supported.
type KdfType string

const (
	HKDF_Sha256 KdfType = "hkdf-sha256"
)

// Expresses the progress of an encryption or decryption operation.
type ProgressCallback func(processedBytes, totalBytes int64)

// Defines the configuration options for the encryptor.
type EncryptorOptions struct {
	DBPath          string
	AllowExtraProps bool
	EnableLogging   bool
	Encoding        BufferEncoding
}
type EncryptorFolderOptions struct {
	FolderPath  string
	SecretKey   *memguard.LockedBuffer
	Concurrency int // <= 0 means decide automatically
	OnProgress  ProgressCallback
}

// Defines the header info stored in the encrypted file.
type EncryptedHeader struct {
	Kdf  KdfType `json:"kdf"`
	Salt []byte  `json:"salt"`
}

type VaultHeader struct {
	Kdf      KdfType `json:"kdf"`
	Salt     []byte  `json:"salt"`
	Opslimit uint32  `json:"opslimit"`
	Memlimit uint32  `json:"memlimit"`
	Verifier []byte  `json:"verifier"`
}

type VaultItemType string

const (
	VaultItemTypeFile   VaultItemType = "file"
	VaultItemTypeFolder VaultItemType = "folder"
)

type VaultItem struct {
	ExtraProps    map[string]any `json:"extraProps,omitempty"`
	EncryptedName string         `json:"encryptedName"`
	EncryptedAt   *time.Time     `json:"encryptedAt,omitempty"`
	IsHidden      bool           `json:"isHidden,omitempty"`
	Size          int64          `json:"size,omitempty"`
	Path          string         `json:"path"`
	ID            string         `json:"_id"`
	Type          VaultItemType  `json:"type"`
	Content       []VaultItem    `json:"content,omitempty"`
}

type VaultFile struct {
	Header *VaultHeader                `json:"__header__"`
	Body   map[string]json.RawMessage `json:"__body__,omitempty"`
}
