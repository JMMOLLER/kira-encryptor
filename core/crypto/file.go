package crypto

import (
	"bytes"
	"crypto/cipher"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/JMMOLLER/kira-encryptor/core/errors"
	"github.com/JMMOLLER/kira-encryptor/core/types"
	"github.com/awnumar/memguard"
	"golang.org/x/crypto/chacha20poly1305"
)

type FileEncryptionOptions struct {
	FilePath   string
	OnProgress func(processedBytes int64, totalBytes int64)
	SecretKey  *memguard.LockedBuffer
	TempPath   string
}

func EncryptFile(opts FileEncryptionOptions) error {
	// Open the source file for reading.
	sourceFile, err := os.Open(opts.FilePath)
	if err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "opening source file", Err: err}
	}
	defer sourceFile.Close()

	// Get the total size of the source file for progress tracking.
	fileInfo, err := sourceFile.Stat()
	if err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "getting file info", Err: err}
	}
	fileSize := fileInfo.Size()

	// Create the destination file for writing the encrypted data.
	destFile, err := os.Create(opts.TempPath)
	if err != nil {
		return &errors.FileError{Path: opts.TempPath, Op: "creating destination file", Err: err}
	}
	defer destFile.Close()

	// Generate a random salt for key derivation.
	salt, err := generateSalt()
	if err != nil {
		return err
	}

	// Derive the file encryption key from the secret key and salt.
	fileKey, err := DeriveFileKey(opts.SecretKey, salt)
	if err != nil {
		return err
	}
	defer fileKey.Destroy()

	// Create the file header with the necessary metadata.
	header := types.EncryptedHeader{
		Kdf:  types.HKDF_Sha256,
		Salt: salt,
	}
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return &errors.CryptoError{Op: "marshaling file header", Err: err}
	}

	// Construct the complete header metadata to be written to the file.
	headerMetaData := make([]byte, 0, VERSION_BYTE+int(FILE_FORMAT_VERSION)+HEADER_LEN_BYTES+len(headerBytes))
	headerMetaData = append(headerMetaData, FILE_MAGIC[:]...)
	headerMetaData = append(headerMetaData, FILE_FORMAT_VERSION)
	// Prepend the header length as a 4-byte big-endian integer before the header bytes.
	headerLen := make([]byte, HEADER_LEN_BYTES)
	binary.BigEndian.PutUint32(headerLen, uint32(len(headerBytes)))
	headerMetaData = append(headerMetaData, headerLen...)
	headerMetaData = append(headerMetaData, headerBytes...)

	if _, err := destFile.Write(headerMetaData); err != nil {
		return &errors.FileError{Path: opts.TempPath, Op: "writing file header", Err: err}
	}

	// Initialize the AEAD cipher for encrypting the file data.
	aead, err := chacha20poly1305.NewX(fileKey.Bytes())
	if err != nil {
		return &errors.CryptoError{Op: "creating AEAD cipher", Err: err}
	}

	// Initialize the AEAD cipher for encrypting the file data.
	readBuffer := make([]byte, CHUNK_SIZE)
	chunkID := uint64(0)

	for {
		bytesRead, err := sourceFile.Read(readBuffer)
		if err != nil && err != io.EOF {
			return &errors.FileError{Path: opts.FilePath, Op: "reading source file", Err: err}
		}
		if bytesRead == 0 {
			break // End of file reached
		}

		chunkID++ // Increment the chunk ID for each chunk read

		// Get the actual chunk data that was read from the file.
		chunkData := readBuffer[:bytesRead]

		// Encrypt the chunk using the file key and chunk ID.
		encryptedChunk, err := encryptChunk(chunkData, aead, chunkID)
		if err != nil {
			return &errors.CryptoError{Op: "encrypting chunk", Err: err}
		}
		// Write the encrypted chunk to the destination file.
		if _, err := destFile.Write(encryptedChunk); err != nil {
			return &errors.FileError{Path: opts.TempPath, Op: "writing encrypted chunk", Err: err}
		}

		// Update progress if a callback is provided.
		if opts.OnProgress != nil {
			opts.OnProgress(int64(bytesRead), int64(fileSize))
		}

		if err == io.EOF {
			break // End of file reached
		}
	}

	return destFile.Sync() // Ensure all data is flushed to disk
}

func encryptChunk(chunkData []byte, aead cipher.AEAD, chunkID uint64) ([]byte, error) {
	// Create the additional authenticated data (AAD) for the chunk, which includes the chunk ID.
	var aad [8]byte
	binary.BigEndian.PutUint64(aad[:], chunkID)

	// Create a unique nonce for the chunk using the chunk ID.
	nonce, err := generateNonce()
	if err != nil {
		return nil, err
	}

	// Encrypt the chunk data using the AEAD cipher.
	encryptedLen := len(chunkData) + aead.Overhead()
	totalSize := aead.NonceSize() + 8 + encryptedLen

	// Construct the encrypted chunk format: [nonce][encryptedLen (8 bytes)][ciphertext+tag]
	result := make([]byte, aead.NonceSize()+8, totalSize)
	copy(result[:aead.NonceSize()], nonce)

	// Append the encryptedLen as an 8-byte big-endian integer after the nonce.
	binary.BigEndian.PutUint64(result[aead.NonceSize():], uint64(encryptedLen))
	result = aead.Seal(result, nonce, chunkData, aad[:])

	return result, nil
}

// ========================
// 				DECRYPTION
// ========================

type FileDecryptionOptions struct {
	FilePath   string
	OnProgress func(processedBytes int64, totalBytes int64)
	SecretKey  *memguard.LockedBuffer
	TempPath   string
}

func DecryptFile(opts FileDecryptionOptions) error {
	// Open the encrypted file for reading and get its total size for progress tracking.
	sourceFile, err := os.Open(opts.FilePath)
	if err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "opening encrypted file", Err: err}
	}
	defer sourceFile.Close()

	fileInfo, err := sourceFile.Stat()
	if err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "getting file info", Err: err}
	}
	fileSize := fileInfo.Size()

	// Create the destination file for writing the decrypted data.
	destFile, err := os.Create(opts.TempPath)
	if err != nil {
		return &errors.FileError{Path: opts.TempPath, Op: "creating plaintext file", Err: err}
	}
	defer destFile.Close()

	// Extract and validate the file header to retrieve the salt for key derivation.
	magicBuf := make([]byte, len(FILE_MAGIC))
	if _, err := io.ReadFull(sourceFile, magicBuf); err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "reading file magic", Err: err}
	}
	if !bytes.Equal(magicBuf, FILE_MAGIC[:]) {
		return &errors.CryptoError{Op: "validating file signature", Err: fmt.Errorf("invalid file magic")}
	}

	var versionBuf [1]byte // Use a fixed-size array for the version byte
	if _, err := io.ReadFull(sourceFile, versionBuf[:]); err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "reading format version", Err: err}
	}
	if versionBuf[0] != FILE_FORMAT_VERSION {
		return &errors.CryptoError{Op: "validating version", Err: fmt.Errorf("unsupported file version: %d", versionBuf[0])}
	}

	headerLenBuf := make([]byte, HEADER_LEN_BYTES)
	if _, err := io.ReadFull(sourceFile, headerLenBuf); err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "reading header length", Err: err}
	}
	headerLen := binary.BigEndian.Uint32(headerLenBuf)

	// Read and parse the header metadata to extract the salt for key derivation.
	headerBytes := make([]byte, headerLen)
	if _, err := io.ReadFull(sourceFile, headerBytes); err != nil {
		return &errors.FileError{Path: opts.FilePath, Op: "reading header data", Err: err}
	}

	var header types.EncryptedHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return &errors.CryptoError{Op: "unmarshaling file header", Err: err}
	}

	// Derive the file encryption key from the secret key and salt.
	fileKey, err := DeriveFileKey(opts.SecretKey, header.Salt)
	if err != nil {
		return err
	}
	defer fileKey.Destroy()

	// Initialize the AEAD cipher for decrypting the file data.
	aead, err := chacha20poly1305.NewX(fileKey.Bytes())
	if err != nil {
		return &errors.CryptoError{Op: "initializing AEAD cipher", Err: err}
	}

	// Initialize buffers for reading the encrypted chunks.
	nonceBuf := make([]byte, aead.NonceSize())
	lenBuf := make([]byte, 8) // 8 bytes for the encrypted chunk length
	chunkID := uint64(0)
	
	// Calculate the initial processed bytes count after reading the header and metadata.
	var processedBytes int64 = int64(len(FILE_MAGIC)) + 1 + int64(HEADER_LEN_BYTES) + int64(headerLen)

	for {
		// Read the next nonce for the chunk
		if _, err := io.ReadFull(sourceFile, nonceBuf); err != nil {
			if err == io.EOF {
				break // File fully processed
			}
			return &errors.FileError{Path: opts.FilePath, Op: "reading nonce", Err: err}
		}
		processedBytes += int64(aead.NonceSize())

		// Read the next 8 bytes to get the length of the encrypted chunk.
		if _, err := io.ReadFull(sourceFile, lenBuf); err != nil {
			return &errors.FileError{Path: opts.FilePath, Op: "reading chunk length", Err: err}
		}
		processedBytes += 8
		encryptedLen := binary.BigEndian.Uint64(lenBuf)

		// Prevent potential DoS by validating the encrypted chunk length before reading the chunk data.
		if encryptedLen > uint64(CHUNK_SIZE+aead.Overhead()+1024) {
			return &errors.CryptoError{Op: "validating chunk size", Err: fmt.Errorf("chunk size exceeds allowed limits, possible file corruption")}
		}

		// Read the encrypted chunk data based on the length read.
		cipherTextBuf := make([]byte, encryptedLen)
		if _, err := io.ReadFull(sourceFile, cipherTextBuf); err != nil {
			return &errors.FileError{Path: opts.FilePath, Op: "reading ciphertext", Err: err}
		}
		processedBytes += int64(encryptedLen)

		chunkID++

		// Decrypt the chunk using the AEAD cipher and the chunk ID as AAD.
		plainText, err := decryptChunk(cipherTextBuf, nonceBuf, aead, chunkID)
		if err != nil {
			return &errors.CryptoError{Op: "decrypting chunk", Err: err}
		}

		// Write the decrypted plaintext chunk to the destination file.
		if _, err := destFile.Write(plainText); err != nil {
			return &errors.FileError{Path: opts.TempPath, Op: "writing plaintext chunk", Err: err}
		}

		// Update progress if a callback is provided.
		if opts.OnProgress != nil {
			opts.OnProgress(processedBytes, fileSize)
		}
	}

	return destFile.Sync()
}

func decryptChunk(cipherText []byte, nonce []byte, aead cipher.AEAD, chunkID uint64) ([]byte, error) {
	// Define AAD
	var aad [8]byte
	binary.BigEndian.PutUint64(aad[:], chunkID)

	// Decrypt the chunk using the AEAD cipher.
	plainText, err := aead.Open(nil, nonce, cipherText, aad[:])
	if err != nil {
		return nil, err
	}

	return plainText, nil
}