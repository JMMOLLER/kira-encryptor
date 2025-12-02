import type { BufferEncoding } from "../types/public";
import sodium from "libsodium-wrappers-sumo";

/**
 * @description `[ENG]` Decrypts the given encrypted text using the secret key.
 * @description `[ES]` Descifra el mensaje cifrado dado utilizando la clave secreta.
 * @param encryptedText - The encrypted text to be decrypted
 */
export default function decryptText(
  encryptedText: string,
  SECRET_KEY: Uint8Array,
  encoding: BufferEncoding
) {
  // Convert the encrypted text to bytes
  const combined = new Uint8Array(Buffer.from(encryptedText, encoding));

  // Get the nonce and cipher from the combined array
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const cipher = combined.slice(sodium.crypto_secretbox_NONCEBYTES);

  // Decrypt the cipher using the nonce and secret key
  try {
    const decrypted = sodium.crypto_secretbox_open_easy(
      cipher,
      nonce,
      SECRET_KEY
    );
    return sodium.to_string(decrypted);
  } catch (err) {
    throw err;
  }
}
