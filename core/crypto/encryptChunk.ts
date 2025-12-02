import generateNonce from "./generateNonce";
import sodium from "libsodium-wrappers-sumo";
import type { WriteStream } from "fs";

interface ChunkEncryptionProps {
  SECRET_KEY: Uint8Array;
  log?: WriteStream;
  chunk: Buffer;
  id: number;
}

async function encryptChunk(props: ChunkEncryptionProps): Promise<Buffer> {
  const { chunk, SECRET_KEY, log } = props;

  const nonce = await generateNonce();
  const encrypted = sodium.crypto_secretbox_easy(chunk, nonce, SECRET_KEY);

  // Prepare output: nonce + length + encrypted data
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(encrypted.length, 0);

  // Write to the writable stream logging
  if (log) {
    log.write(`📦 Chunk #${props.id}\n`);
    log.write(` - Nonce: ${Buffer.from(nonce).toString("hex")}\n`);
    log.write(` - Encrypted Length: ${Buffer.from(encrypted).length}\n`);
  }

  return Buffer.concat([Buffer.from(nonce), lenBuf, Buffer.from(encrypted)]);
}

export default encryptChunk;
