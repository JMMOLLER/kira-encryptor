import sodium from "sodium-native";

/**
 * @description `[ENG]` Generates a nonce for encryption.
 * @description `[ES]` Genera un nonce para la cifrado.
 */
export default function generateNonce(): Buffer {
  const nonce = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES);
  sodium.randombytes_buf(nonce);
  return nonce;
}
