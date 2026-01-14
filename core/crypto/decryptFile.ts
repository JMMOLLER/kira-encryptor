import { CRYPTO_BASE, CRYPTO_NODE } from "./constants";
import { deriveFileKey } from "./keyDerivation";
import { FileSystem } from "../libs/FileSystem";
import { Transform, pipeline } from "stream";
import decryptChunk from "./decryptChunk";
import { open } from "fs/promises";
import { promisify } from "util";

const pipelineAsync = promisify(pipeline);
const FS = FileSystem.getInstance();

interface FileDecryptionProps {
  filePath: Readonly<string>;
  enableLogging?: boolean;
  blockSize: number;
  /**
   * `processedBytes` - Number of bytes processed so far.
   */
  onProgress: (processedBytes: number) => void;
  SECRET_KEY: Buffer;
  tempPath: string;
}

async function decryptFile(props: FileDecryptionProps): Promise<void> {
  const { filePath, onProgress, blockSize, tempPath } = props;

  // ---- 1) Read header (magic + version + headerLen + headerJson) ----
  const fd = await open(filePath, "r");
  try {
    // First 9 bytes: 4 magic + 1 version + 4 headerLen
    const FIXED_HEADER_LEN =
      CRYPTO_BASE.FILE_MAGIC_LEN +
      CRYPTO_BASE.FILE_VERSION_LEN +
      CRYPTO_BASE.HEADER_LEN_BYTES;
    const headBuf = Buffer.alloc(FIXED_HEADER_LEN);
    const { bytesRead } = await fd.read(headBuf, 0, headBuf.length, 0);
    if (bytesRead < headBuf.length) {
      throw new Error("Archivo demasiado corto: imposible leer header.");
    }

    const magic = headBuf
      .subarray(0, CRYPTO_BASE.FILE_MAGIC_LEN)
      .toString("ascii");
    const headerLen = headBuf.readUInt32BE(
      CRYPTO_BASE.FILE_MAGIC_LEN + CRYPTO_BASE.FILE_VERSION_LEN
    );

    if (magic !== CRYPTO_BASE.FILE_MAGIC.toString("ascii")) {
      throw new Error(
        "Magic inválido: no es un archivo cifrado en formato esperado."
      );
    }

    // Read header JSON
    const headerJsonBuf = Buffer.alloc(headerLen);
    const headerOffset = headBuf.length; // 9
    const { bytesRead: headerBytesRead } = await fd.read(
      headerJsonBuf,
      0,
      headerLen,
      headerOffset
    );
    if (headerBytesRead < headerLen) {
      throw new Error("No se pudo leer completamente el header JSON.");
    }

    const headerStr = headerJsonBuf.toString("utf8");
    let headerObj: any;
    try {
      headerObj = JSON.parse(headerStr);
    } catch (err) {
      throw new Error("Header JSON inválido o corrupto.");
    }

    // Extract salt and KDF parameters
    if (!headerObj?.salt) {
      throw new Error("Header no contiene 'salt'.");
    }
    const saltHex: string = headerObj.salt;
    const saltBuf = Buffer.from(saltHex, "hex");
    if (saltBuf.length !== CRYPTO_NODE.SALT_BYTES) {
      throw new Error("Salt con tamaño incorrecto en el header.");
    }
    const salt = Buffer.from(saltBuf);

    // ---- 2) Generate derived key ----
    const fileKey = deriveFileKey(props.SECRET_KEY, salt);

    // Close previous descriptor
    await fd.close();

    // Streams for reading and writing file
    const rs = FS.createReadStream(filePath, {
      highWaterMark: blockSize,
      start: headBuf.length + headerLen, // skip header
    });
    const ws = FS.createWriteStream(tempPath, { highWaterMark: blockSize });

    // If logging is enabled, create a write stream for logging
    let log: ReturnType<typeof FS.createWriteStream> | null = null;
    if (props.enableLogging) {
      log = FS.createWriteStream(
        filePath + CRYPTO_BASE.FILE_EXTENSION + ".dec.log"
      );
      log.write(`🟢 Inicio de cifrado: ${filePath}\n`);
      log.write(`Tamaño total: ${FS.getStatFile(filePath).size} bytes\n`);
      log.write(`Header: ${JSON.stringify(headerObj)}\n`);
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

        let offset = 0;
        try {
          while (
            leftover.length - offset >=
            CRYPTO_NODE.NONCE_BYTES +
              CRYPTO_BASE.HEADER_LEN_BYTES +
              CRYPTO_NODE.MAC_BYTES
          ) {
            // Increment the chunk count
            (this as any)._chunkCount++;

            const chunkNonce = leftover.subarray(
              offset,
              offset + CRYPTO_NODE.NONCE_BYTES
            );
            const lenBuf = leftover.subarray(
              offset + CRYPTO_NODE.NONCE_BYTES,
              offset + CRYPTO_NODE.NONCE_BYTES + CRYPTO_BASE.HEADER_LEN_BYTES
            );
            const encryptedLen = lenBuf.readUInt32BE(0);

            // Check if we have enough data for the encrypted chunk
            if (
              leftover.length - offset <
              CRYPTO_NODE.NONCE_BYTES +
                CRYPTO_BASE.HEADER_LEN_BYTES +
                encryptedLen
            )
              break;

            const { newOffset, plain } = decryptChunk({
              id: (this as any)._chunkCount,
              nonceLen: CRYPTO_NODE.NONCE_BYTES,
              SECRET_KEY: fileKey,
              encryptedLen,
              chunkNonce,
              leftover,
              offset,
            });

            // Recalculate the offset for the next iteration
            offset += newOffset;

            // Send the progress
            onProgress?.(
              CRYPTO_NODE.NONCE_BYTES +
                CRYPTO_BASE.HEADER_LEN_BYTES +
                encryptedLen
            );

            // Log the chunk details if logging is enabled
            if (log && !log.closed) {
              const n = (this as any)._chunkCount;
              log.write(`📦 Chunk #${n}\n`);
              log.write(
                ` - Nonce: ${Buffer.from(chunkNonce).toString("hex")}\n`
              );
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
      },
    });

    // This call handles the piping of the read stream to the decrypt stream and then to the write stream
    await pipelineAsync(rs, decryptStream, ws);

    // Ensure the write stream logging is closed
    if (log) {
      log.end(`✅ Cifrado completado: ${filePath}\n`);
      await new Promise<void>((resolve) => log.on("close", resolve));
    }
  } finally {
    try {
      await fd.close();
    } catch (_) {
      // ignore error on close
    }
  }
}

export default decryptFile;
