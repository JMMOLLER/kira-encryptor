import generateNonce from "./generateNonce";
import type { WriteStream } from "fs";
import sodium from "sodium-native";

interface ChunkEncryptionProps {
  SECRET_KEY: Buffer;
  log?: WriteStream;
  chunk: Buffer;
  id: number;
}

/**
 * @description `[ENG]` Encrypts a data chunk using a unique nonce and the secret key.
 * @description `[ESP]` Cifra un bloque de datos utilizando un nonce único y la clave secreta.
 */
function encryptChunk(props: ChunkEncryptionProps): Buffer {
  const { chunk, SECRET_KEY, log } = props;

  // Generate nonce (Buffer)
  const nonce = generateNonce();

  // Allocate ciphertext buffer: chunk + MAC
  const encrypted = Buffer.alloc(
    chunk.length + sodium.crypto_secretbox_MACBYTES
  );
  // Perform encryption
  sodium.crypto_secretbox_easy(encrypted, chunk, nonce, SECRET_KEY);

  // Prepare 4-byte big-endian length of encrypted payload
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(encrypted.length, 0);

  // Optional logging
  if (log) {
    log.write(`📦 Chunk #${props.id}\n`);
    log.write(` - Nonce: ${nonce.toString("hex")}\n`);
    log.write(` - Encrypted Length: ${encrypted.length}\n`);
  }

  // Return format: [nonce][len][cipher]
  return Buffer.concat([nonce, lenBuf, encrypted]);
}

export default encryptChunk;
