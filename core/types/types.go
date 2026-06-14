package types

// Represents the various buffer encodings supported.
type BufferEncoding string

const (
	BufferEncodingBase64    BufferEncoding = "base64"
	BufferEncodingBase64URL BufferEncoding = "base64url"
	BufferEncodingHex       BufferEncoding = "hex"
)

// Indicates the type of task a worker should perform.
type WorkerTaskType string

const (
	WorkerTaskEncrypt WorkerTaskType = "encrypt"
	WorkerTaskDecrypt WorkerTaskType = "decrypt"
)

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
	MaxThreads      int
	EnableLogging   bool
	Encoding        BufferEncoding
}

// Defines the header info stored in the encrypted file.
type EncryptedHeader struct {
	Kdf      KdfType `json:"kdf"`
	Salt     []byte `json:"salt"`
}

type VaultHeader struct {
	Kdf      KdfType `json:"kdf"`
	Salt     []byte `json:"salt"`
	Opslimit uint32 `json:"opslimit"`
	Memlimit uint32 `json:"memlimit"`
	Verifier []byte `json:"verifier"`
}