import sodium from "sodium-native";

/**
 * Global cryptographic constants.
 * MUST remain consistent across the entire project.
 */

// KDF defaults
export const DEFAULT_KDF = sodium.crypto_pwhash_ALG_ARGON2ID13;
export const DEFAULT_OPSLIMIT = sodium.crypto_pwhash_OPSLIMIT_MODERATE;
export const DEFAULT_MEMLIMIT = sodium.crypto_pwhash_MEMLIMIT_MODERATE;

// Sizes
export const SALT_BYTES = sodium.crypto_pwhash_SALTBYTES; // 16 bytes
export const NONCE_BYTES = sodium.crypto_secretbox_NONCEBYTES; // 24 bytes
export const MAC_BYTES = sodium.crypto_secretbox_MACBYTES; // 16 bytes
