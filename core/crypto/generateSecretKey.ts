import deriveFileKey from "./deriveFileKey";
import sodium from "sodium-native";

/**
 * @description `[ESP]` - Genera una clave derivada segura a partir de la contraseña proporcionada y un salt persistente.
 * @description `[ENG]` - Generates a secure derived key from the provided passphrase and a persistent salt.
 * @note `[ESP]` - Es importante evitar el uso de Buffer.from o strings literales para datos sensibles porque quedan en el heap de memoria y pueden ser accedidos por terceros.
 * @note `[ENG]` - It is important to avoid using Buffer.from or string literals for sensitive data because they remain in the memory heap and can be accessed by third parties.
 * @param passphrase - The passphrase used to derive the secret key.
 * @returns A SecureBuffer containing the derived secret key.
 */
export default function generateSecretKey(passphrase: Buffer): sodium.SecureBuffer {
  // create salt
  const BASE_SALT = Buffer.from([
    0x6b, 0x40, 0x29, 0xbe, 0x03, 0x6d, 0xe6, 0x6e, 0x98, 0x55, 0xd5, 0x96,
    0xc1, 0x6b, 0xe5, 0xfe
  ]);
  const SECURE_SALT = sodium.sodium_malloc(
    BASE_SALT.length
  );
  sodium.sodium_mprotect_readwrite(SECURE_SALT);
  SECURE_SALT.set(BASE_SALT);

  // create key
  const SECRET_KEY = sodium.sodium_malloc(32);
  const KEY = deriveFileKey(passphrase, SECURE_SALT);
  KEY.copy(SECRET_KEY);

  // set memory protections for secret key
  sodium.sodium_mprotect_readonly(SECRET_KEY);

  // clean up
  sodium.sodium_memzero(SECURE_SALT);
  sodium.sodium_memzero(passphrase);
  sodium.sodium_memzero(BASE_SALT);
  sodium.sodium_memzero(KEY);

  return SECRET_KEY;
}
