import sodium from "libsodium-wrappers-sumo";

interface ChunkDecryptionProps {
  id: number;
  leftover: Buffer;
  offset: number;
  nonceLen: number;
  encryptedLen: number;
  chunkNonce: Buffer;
  SECRET_KEY: Uint8Array;
}

async function decryptChunk(props: ChunkDecryptionProps) {
  const { leftover, encryptedLen, nonceLen, offset } = props;

  // Extract the encrypted chunk
  const encryptedChunk = leftover.subarray(
    offset + nonceLen + 4,
    offset + nonceLen + 4 + encryptedLen
  );

  // Decrypt the chunk
  const plain = sodium.crypto_secretbox_open_easy(
    encryptedChunk,
    props.chunkNonce,
    props.SECRET_KEY
  );
  if (!plain) {
    throw new Error("Error when decoding block");
  }

  return {
    plain: Buffer.from(plain),
    newOffset: nonceLen + 4 + encryptedLen
  };
}

export default decryptChunk;
