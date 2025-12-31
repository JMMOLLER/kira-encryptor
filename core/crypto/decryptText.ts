import type { BufferEncoding } from "../types/public";
import sodium from "sodium-native";

/**
 * @description `[ENG]` Decrypts the given encrypted text using the secret key.
 * @description `[ES]` Descifra el mensaje cifrado dado utilizando la clave secreta.
 * @param encryptedText - The encrypted text to be decrypted
 */
export default function decryptText(
  encryptedText: string,
  SECRET_KEY: Buffer,
  encoding: BufferEncoding
) {
  // Convert the encoded text to bytes (Buffer)
  const combined = Buffer.from(encryptedText, encoding);
  // Define nonce length
  const nonceLen = sodium.crypto_secretbox_NONCEBYTES;

  // Extract nonce and ciphertext
  const nonce = combined.subarray(0, nonceLen);
  const cipher = combined.subarray(nonceLen);

  // Allocate output buffer: ciphertextLen - MAC
  if (cipher.length < sodium.crypto_secretbox_MACBYTES) {
    throw new Error("Ciphertext too short");
  }

  const plain = Buffer.alloc(cipher.length - sodium.crypto_secretbox_MACBYTES);

  // Attempt decryption
  const ok = sodium.crypto_secretbox_open_easy(
    plain,
    cipher,
    nonce,
    SECRET_KEY
  );

  if (!ok) {
    throw new Error("wrong secret key");
  }

  return plain.toString("utf8");
}
