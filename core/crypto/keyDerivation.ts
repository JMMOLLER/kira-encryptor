import * as CRYPTO from "./constants";
import sodium from "sodium-native";

/**
 * @description `[ENG]` Derives a file encryption key from a previously derived secret key and a salt using BLAKE2b.
 * @description `[ES]` Deriva una clave de cifrado de archivo a partir de una clave secreta previamente derivada y una salt utilizando BLAKE2b.
 */
function deriveFileKey(secretKey: Uint8Array, salt: Buffer): Buffer {
  // Secret key should be Buffer necessarily
  const SECRET_KEY = Buffer.alloc(secretKey.length);
  // Copy the secretKey Uint8Array into the Buffer
  SECRET_KEY.set(secretKey);

  // 256-bit key
  const fileKey = Buffer.alloc(CRYPTO.FILE_KEY_BYTES);

  // Derive the file key using BLAKE2b
  sodium.crypto_generichash(fileKey, salt, SECRET_KEY); // this funcion only accepts Buffer

  // Clear SECRET_KEY from memory
  sodium.sodium_memzero(SECRET_KEY);

  return fileKey;
}

interface Opts {
  opslimit?: number;
  memlimit?: number;
  algo?: number;
}

/**
 * @description `[ENG]` Derives a file encryption key from a password and salt using Argon2id.
 * @description `[ES]` Deriva una clave de cifrado de archivo a partir de una contraseña y una salt utilizando Argon2id.
 * @default
 * - opslimit: sodium.crypto_pwhash_OPSLIMIT_MODERATE
 * - memlimit: sodium.crypto_pwhash_MEMLIMIT_MODERATE
 * - algo: sodium.crypto_pwhash_ALG_ARGON2ID13
 */
function derivePassword(password: Buffer, salt: Buffer, opts?: Opts): Buffer {
  const key = Buffer.alloc(CRYPTO.SECRET_KEY_BYTES); // 256-bit key
  const opslimit = opts?.opslimit ?? CRYPTO.DEFAULT_OPSLIMIT;
  const memlimit = opts?.memlimit ?? CRYPTO.DEFAULT_MEMLIMIT;
  const algo = opts?.algo ?? CRYPTO.DEFAULT_KDF;

  sodium.crypto_pwhash(key, password, salt, opslimit, memlimit, algo);

  return key;
}

export { deriveFileKey, derivePassword };
