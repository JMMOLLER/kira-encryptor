import { checkVerifier, generateVerifier } from "./keyVerifier";
import { CRYPTO_NODE, CRYPTO_BASE } from "./constants/index";
import type { StorageHeader } from "../types/public";
import { derivePassword } from "./keyDerivation";
import sodium from "sodium-native";

interface Result {
  KEY: sodium.SecureBuffer | Buffer;
  /**
   * Contains an hexadecimal string representing the verifier for the derived key.
   */
  keyVerifier: string;
}

/**
 * @description `[ESP]` - Genera una clave derivada segura a partir de la contraseña proporcionada y un salt persistente.
 * @description `[ENG]` - Generates a secure derived key from the provided passphrase and a persistent salt.
 * @note `[ESP]` - Es importante evitar el uso de Buffer.from o strings literales para datos sensibles porque quedan en el heap de memoria y pueden ser accedidos por terceros.
 * @note `[ENG]` - It is important to avoid using Buffer.from or string literals for sensitive data because they remain in the memory heap and can be accessed by third parties.
 * @param passphrase - The passphrase used to derive the secret key. **The value will be zeroed out after use.**
 * @returns A SecureBuffer containing the derived secret key.
 */
export default function generateSecretKey(
  passphrase: Buffer,
  storageHeader: StorageHeader
): Result {
  const { kdf, memlimit, opslimit, salt, verifier } = storageHeader;
  let keyVerifier = verifier as string | undefined;

  // Get base salt from storage header
  const BASE_SALT = Buffer.from(salt, "hex");

  if (BASE_SALT.length !== CRYPTO_NODE.SALT_BYTES) {
    throw new Error("Invalid salt length in storage header");
  }

  // Prepare derivation options
  const opts = {
    algo: kdf,
    opslimit,
    memlimit,
  };

  // Security checks
  if (opts.opslimit < CRYPTO_NODE.DEFAULT_OPSLIMIT) {
    throw new Error("Insecure opslimit");
  }
  if (opts.memlimit < CRYPTO_NODE.DEFAULT_MEMLIMIT) {
    throw new Error("Insecure memlimit");
  }

  // Electron >= 21 disallows exposing native (malloc'd) memory as JS Buffers
  // due to V8 Memory Cage, so sodium_malloc() cannot be used safely here.
  let KEY: Buffer | sodium.SecureBuffer;
  let isSecure = false;
  try {
    const secure = sodium.sodium_malloc(CRYPTO_BASE.SECRET_KEY_BYTES);
    isSecure = Boolean(secure.secure);
    KEY = secure;
  } catch {
    console.warn("[Encryptor] Unsecure key allocation.");
    // create key
    KEY = Buffer.alloc(CRYPTO_BASE.SECRET_KEY_BYTES);
  }
  const SECURE_PASSWORD = derivePassword(passphrase, BASE_SALT, opts);
  SECURE_PASSWORD.copy(KEY);

  // verify key if verifier exists
  if (keyVerifier) {
    const res = checkVerifier(KEY, keyVerifier);
    if (!res) {
      if (isSecure) sodium.sodium_mprotect_noaccess(KEY as sodium.SecureBuffer);
      sodium.sodium_memzero(KEY);
      throw new Error("Invalid passphrase");
    }
  } else {
    // Generate and store verifier if it doesn't exist
    keyVerifier = generateVerifier(KEY).toString("hex");
  }

  // set memory protections for secret key
  if (isSecure) sodium.sodium_mprotect_readonly(KEY as sodium.SecureBuffer);

  // clean up
  sodium.sodium_memzero(passphrase);
  sodium.sodium_memzero(BASE_SALT);
  sodium.sodium_memzero(SECURE_PASSWORD);

  return { KEY, keyVerifier };
}
