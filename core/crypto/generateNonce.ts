import sodium from "libsodium-wrappers-sumo";

/**
 * @description `[ENG]` Generates a nonce for encryption.
 * @description `[ES]` Genera un nonce para la cifrado.
 */
export default async function generateNonce(): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
}
