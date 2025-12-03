import sodium from "sodium-native";

interface ChunkDecryptionProps {
  id: number;
  leftover: Buffer;
  offset: number;
  nonceLen: number;
  encryptedLen: number;
  chunkNonce: Buffer;
  SECRET_KEY: Buffer;
}

function decryptChunk(props: ChunkDecryptionProps) {
  const { leftover, encryptedLen, nonceLen, offset } = props;

  // Extract the encrypted chunk
  const encryptedChunk = leftover.subarray(
    offset + nonceLen + 4,
    offset + nonceLen + 4 + encryptedLen
  );

  // Allocate buffer for plaintext
  const plain = Buffer.alloc(encryptedLen - sodium.crypto_secretbox_MACBYTES);

  // Decrypt chunk (returns boolean)
  const ok = sodium.crypto_secretbox_open_easy(
    plain,
    encryptedChunk,
    props.chunkNonce,
    props.SECRET_KEY
  );
  if (!ok) {
    throw new Error(`Error when decoding block #${props.id}`);
  }

  return {
    plain: Buffer.from(plain),
    newOffset: nonceLen + 4 + encryptedLen
  };
}

export default decryptChunk;
