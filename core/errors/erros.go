package errors

import "errors"

// ===== DOMAIN ERRORS =====

var (
	ErrInvalidKey        = errors.New("invalid encryption key")
	ErrInvalidNonce      = errors.New("invalid nonce")
	ErrInvalidFileFormat = errors.New("invalid kira file format")
	ErrCorruptedData     = errors.New("corrupted encrypted data")
	ErrDecryptionFailed  = errors.New("decryption failed")
	ErrEncryptionFailed  = errors.New("encryption failed")
)

// ===== STRUCTURE ERRORS =====

type CryptoError struct {
	Op  string
	Err error
}

func (e *CryptoError) Error() string {
	return "crypto error during " + e.Op + ": " + e.Err.Error()
}

func (e *CryptoError) Unwrap() error {
	return e.Err
}

// =====

type FileError struct {
	Path string
	Op   string
	Err  error
}

func (e *FileError) Error() string {
	return e.Op + " failed on " + e.Path + ": " + e.Err.Error()
}

func (e *FileError) Unwrap() error {
	return e.Err
}
