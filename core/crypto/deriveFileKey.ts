import sodium from "sodium-native";

interface KeyDerivationOptions {
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
export default function deriveFileKey(
  password: Buffer,
  salt: Buffer,
  opts?: KeyDerivationOptions
): Buffer {
  const key = Buffer.alloc(32); // 256-bit key
  const opslimit = opts?.opslimit ?? sodium.crypto_pwhash_OPSLIMIT_MODERATE;
  const memlimit = opts?.memlimit ?? sodium.crypto_pwhash_MEMLIMIT_MODERATE;
  const algo = opts?.algo ?? sodium.crypto_pwhash_ALG_ARGON2ID13;

  sodium.crypto_pwhash(key, password, salt, opslimit, memlimit, algo);

  return key;
}
