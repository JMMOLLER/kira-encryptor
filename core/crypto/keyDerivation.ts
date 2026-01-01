import sodium from "sodium-native";

/**
 * @description `[ENG]` Derives a file encryption key from a previously derived secret key and a salt using BLAKE2b.
 * @description `[ES]` Deriva una clave de cifrado de archivo a partir de una clave secreta previamente derivada y una salt utilizando BLAKE2b.
 */
function deriveFileKey(secretKey: Buffer, salt: Buffer): Buffer {
  // 256-bit key
  const fileKey = Buffer.alloc(32);

  // Derive the file key using BLAKE2b
  sodium.crypto_generichash(fileKey, salt, secretKey);

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
  const key = Buffer.alloc(32); // 256-bit key
  const opslimit = opts?.opslimit ?? sodium.crypto_pwhash_OPSLIMIT_MODERATE;
  const memlimit = opts?.memlimit ?? sodium.crypto_pwhash_MEMLIMIT_MODERATE;
  const algo = opts?.algo ?? sodium.crypto_pwhash_ALG_ARGON2ID13;

  sodium.crypto_pwhash(key, password, salt, opslimit, memlimit, algo);

  return key;
}

export { deriveFileKey, derivePassword };
