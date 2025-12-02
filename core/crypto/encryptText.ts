import type { BufferEncoding } from "../types/public";
import generateNonce from "./generateNonce";
import sodium from "libsodium-wrappers-sumo";

/**
 * @description `[ENG]` Encrypts the given text using the secret key and a nonce.
 * @description `[ES]` Cifra el texto dado utilizando la clave secreta y un nonce.
 * @param txt - The text to be encrypted
 */
export default async function encryptText(
  txt: string,
  SECRET_KEY: Uint8Array,
  encoding: BufferEncoding
): Promise<string> {
  // Convert the text to bytes
  const textBytes = sodium.from_string(txt);
  const nonce = await generateNonce();

  // Encrypt the text using the nonce and secret key
  const cipher = sodium.crypto_secretbox_easy(textBytes, nonce, SECRET_KEY);

  // Combine the nonce and cipher into a single Uint8Array
  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce);
  combined.set(cipher, nonce.length);

  return Buffer.from(combined).toString(encoding);
}
