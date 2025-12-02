import { FileSystem } from "../libs/FileSystem";
import { Transform, pipeline } from "stream";
import decryptChunk from "./decryptChunk";
import sodium from "libsodium-wrappers-sumo";
import { promisify } from "util";

const pipelineAsync = promisify(pipeline);
const FS = FileSystem.getInstance();

interface FileDecryptionProps {
  filePath: Readonly<string>;
  enableLogging?: boolean;
  blockSize: number;
  onProgress: (processedBytes: number) => void;
  SECRET_KEY: Uint8Array;
  tempPath: string;
}

async function decryptFile(props: FileDecryptionProps): Promise<void> {
  const { filePath, onProgress, blockSize, tempPath } = props;

  // Ensure the sodium library is ready
  await sodium.ready;

  // Streams for reading and writing file
  const rs = FS.createReadStream(filePath, { highWaterMark: blockSize });
  const ws = FS.createWriteStream(tempPath, { highWaterMark: blockSize });

  // If logging is enabled, create a write stream for logging
  let log: ReturnType<typeof FS.createWriteStream> | null = null;
  if (props.enableLogging) {
    log = FS.createWriteStream(filePath + ".enc.log");
    log.write(`🟢 Inicio de cifrado: ${filePath}\n`);
    log.write(`Tamaño total: ${FS.getStatFile(filePath).size} bytes\n`);
  }

  const decryptStream = new Transform({
    readableObjectMode: false,
    writableObjectMode: false,
    async transform(chunk, _dec, cb) {
      if (!(this as any)._leftover) {
        (this as any)._leftover = Buffer.alloc(0);
        (this as any)._chunkCount = 0;
      }
      let leftover: Buffer = (this as any)._leftover;
      leftover = Buffer.concat([leftover, chunk]);

      const nonceLen = sodium.crypto_secretbox_NONCEBYTES;
      const macLen = sodium.crypto_secretbox_MACBYTES;
      let offset = 0;
      try {
        while (leftover.length - offset >= nonceLen + 4 + macLen) {
          // Increment the chunk count
          (this as any)._chunkCount++;

          const chunkNonce = leftover.subarray(offset, offset + nonceLen);
          const lenBuf = leftover.subarray(
            offset + nonceLen,
            offset + nonceLen + 4
          );
          const encryptedLen = lenBuf.readUInt32BE(0);

          // Check if we have enough data for the encrypted chunk
          if (leftover.length - offset < nonceLen + 4 + encryptedLen) break;

          const { newOffset, plain } = await decryptChunk({
            id: (this as any)._chunkCount,
            SECRET_KEY: props.SECRET_KEY,
            encryptedLen,
            chunkNonce,
            nonceLen,
            leftover,
            offset
          });

          // Recalculate the offset for the next iteration
          offset += newOffset;

          // Send the progress
          onProgress?.(nonceLen + 4 + encryptedLen);

          // Log the chunk details if logging is enabled
          if (log && !log.closed) {
            const n = (this as any)._chunkCount;
            log.write(`📦 Chunk #${n}\n`);
            log.write(` - Nonce: ${Buffer.from(chunkNonce).toString("hex")}\n`);
            log.write(` - Encrypted Length: ${encryptedLen}\n`);
          }

          // Push the decrypted data to the writable stream
          this.push(plain);
        }

        (this as any)._leftover = leftover.subarray(offset);
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
    final(cb) {
      const leftover: Buffer = (this as any)._leftover || Buffer.alloc(0);
      if (leftover.length > 0) {
        return cb(
          new Error("There was some loose data left after the last block")
        );
      }
      cb();
    }
  });

  // This call handles the piping of the read stream to the decrypt stream and then to the write stream
  await pipelineAsync(rs, decryptStream, ws);

  // Ensure the write stream logging is closed
  if (log) {
    log.end(`✅ Cifrado completado: ${filePath}\n`);
    await new Promise<void>((resolve) => log.on("close", resolve));
  }
}

export default decryptFile;
