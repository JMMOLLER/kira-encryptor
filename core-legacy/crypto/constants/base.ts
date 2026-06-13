/**
 * Global cryptographic constants.
 * MUST remain consistent across the entire project.
 */

export const FILE_MAGIC = Buffer.from("AKRA"); // 4 bytes
export const FILE_MAGIC_LEN = FILE_MAGIC.length;

export const FILE_EXTENSION = ".kira";

export const FILE_FORMAT_VERSION = 0x01;
export const FILE_VERSION_LEN = 1; // 1 byte

// Key sizes
/**
 * Used for deriving secret keys from passwords. (32 bytes = 256 bits)
 */
export const SECRET_KEY_BYTES = 32; // Argon2 output
/**
 * Used as per-file encryption key. (32 bytes = 256 bits)
 */
export const FILE_KEY_BYTES = 32; // Per-file encryption key

// Header safety
export const HEADER_LEN_BYTES = 4; // UInt32BE
