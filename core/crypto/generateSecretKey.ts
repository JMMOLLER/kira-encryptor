import { checkVerifier, generateVerifier } from "./keyVerifier";
import type { StorageData, StorageHeader } from "../types/public";
import { derivePassword } from "./keyDerivation";
import sodium from "sodium-native";

interface Result {
  KEY: sodium.SecureBuffer;
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

  if (BASE_SALT.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error("Invalid salt length in storage header");
  }

  // Prepare derivation options
  const opts = {
    algo: kdf,
    opslimit,
    memlimit,
  };

  // Security checks
  if (opts.opslimit < sodium.crypto_pwhash_OPSLIMIT_MODERATE) {
    throw new Error("Insecure opslimit");
  }
  if (opts.memlimit < sodium.crypto_pwhash_MEMLIMIT_MODERATE) {
    throw new Error("Insecure memlimit");
  }

  // create key
  const KEY = sodium.sodium_malloc(32);
  const SECURE_PASSWORD = derivePassword(passphrase, BASE_SALT, opts);
  SECURE_PASSWORD.copy(KEY);

  // verify key if verifier exists
  if (keyVerifier) {
    const res = checkVerifier(KEY, keyVerifier);
    if (!res) {
      sodium.sodium_mprotect_noaccess(KEY);
      sodium.sodium_memzero(KEY);
      throw new Error("Invalid passphrase");
    }
  } else {
    // Generate and store verifier if it doesn't exist
    keyVerifier = generateVerifier(KEY).toString("hex");
  }

  // set memory protections for secret key
  sodium.sodium_mprotect_readonly(KEY);

  // clean up
  sodium.sodium_memzero(passphrase);
  sodium.sodium_memzero(BASE_SALT);
  sodium.sodium_memzero(SECURE_PASSWORD);

  return { KEY, keyVerifier };
}
