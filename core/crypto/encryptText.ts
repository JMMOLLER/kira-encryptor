import type { BufferEncoding } from "../types/public";
import generateNonce from "./generateNonce";
import sodium from "sodium-native";

/**
 * @description `[ENG]` Encrypts the given text using the secret key and a nonce.
 * @description `[ES]` Cifra el texto dado utilizando la clave secreta y un nonce.
 * @param txt - The text to be encrypted
 */
export default function encryptText(
  txt: string,
  SECRET_KEY: Buffer,
  encoding: BufferEncoding
): string {
  // Convert text to bytes
  const textBytes = Buffer.from(txt, "utf8");
  // Generate nonce (Buffer)
  const nonce = generateNonce();

  // Allocate buffer for ciphertext
  const cipher = Buffer.alloc(
    textBytes.length + sodium.crypto_secretbox_MACBYTES
  );

  // Encrypt (in-place, no copy return)
  sodium.crypto_secretbox_easy(cipher, textBytes, nonce, SECRET_KEY);

  // Combine nonce + cipher
  const combined = Buffer.concat([nonce, cipher]);

  return combined.toString(encoding);
}
