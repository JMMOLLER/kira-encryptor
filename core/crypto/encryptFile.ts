import { deriveFileKey } from "./keyDerivation";
import { FileSystem } from "../libs/FileSystem";
import { pipeline, Transform } from "stream";
import encryptChunk from "./encryptChunk";
import generateSalt from "./generateSalt";
import type { WriteStream } from "fs";
import sodium from "sodium-native";
import { promisify } from "util";

interface FileEncryptionProps {
  filePath: Readonly<string>;
  /**
   * `processedBytes` - Number of bytes processed so far.
   */
  onProgress: (processedBytes: number) => void;
  enableLogging?: boolean;
  SECRET_KEY: Buffer;
  blockSize: number;
  tempPath: string;
}

const pipelineAsync = promisify(pipeline);
const FS = FileSystem.getInstance();

/**
 * @description `[ENG]` Encrypts a file using the secret key and saves it with a new name.
 * @description `[ES]` Cifra un archivo utilizando la clave secreta y lo guarda con un nuevo nombre.
 * @param filePath `string` - The path of the file to be encrypted (read-only).
 * @param onProgress `ProgressCallback` - Optional callback function to track progress.
 * @param saveOnEnd `boolean` - Optional flag to save the encrypted file in storage.
 */
async function encryptFile(props: FileEncryptionProps): Promise<void> {
  const { filePath, onProgress, tempPath, SECRET_KEY, blockSize } = props;

  const salt = generateSalt(); // 16 bytes
  const fileKey = deriveFileKey(SECRET_KEY, salt); // Buffer(32)

  // Prepara header
  const headerObj = {
    salt: Buffer.from(salt).toString("hex"),
    version: 1
  };
  const headerJson = Buffer.from(JSON.stringify(headerObj), "utf8");
  const magic = Buffer.from("AKRA"); // 4 bytes
  const version = Buffer.from([0x01]); // 1 byte
  const headerLen = Buffer.alloc(4); // 4 bytes
  headerLen.writeUInt32BE(headerJson.length, 0);

  // Streams for reading and writing file
  const rs = FS.createReadStream(filePath, { highWaterMark: blockSize });
  const ws = FS.createWriteStream(tempPath, { highWaterMark: blockSize });

  // Write header to the beginning of the file
  ws.write(Buffer.concat([magic, version, headerLen, headerJson]));

  // If logging is enabled, create a write stream for logging
  let log: WriteStream | undefined;
  let chunkCount = 0;
  if (props.enableLogging) {
    log = FS.createWriteStream(filePath + ".enc.log");
    log.write(`🟢 Inicio de cifrado: ${filePath}\n`);
    log.write(`Tamaño total: ${FS.getStatFile(filePath).size} bytes\n`);
  }

  // Transform stream to handle encryption
  const encryptStream = new Transform({
    async transform(chunk, _enc, cb) {
      try {
        chunkCount++;
        // Convert chunk to Buffer if it's not already
        const chunkBuf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as string);

        // Encrypt the chunk
        const encryptedChunk = encryptChunk({
          log,
          chunk: chunkBuf,
          id: chunkCount,
          SECRET_KEY: fileKey
        });

        // Send the progress
        onProgress?.(chunkBuf.length);

        cb(null, encryptedChunk);
      } catch (err) {
        cb(err as Error);
      }
    }
  });

  // This call handles the piping of the read stream to the encrypt stream and then to the write stream
  await pipelineAsync(rs, encryptStream, ws);

  // Clean up sensitive data
  sodium.sodium_memzero(fileKey);

  // Ensure the write stream logging is closed
  if (log) {
    log.end(`✅ Cifrado completado: ${filePath}\n`);
    await new Promise<void>((resolve) => log.on("close", resolve));
  }
}

export default encryptFile;
