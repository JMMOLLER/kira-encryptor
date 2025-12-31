import type { WorkerTask } from "../types/public";
import decryptFile from "../crypto/decryptFile";
import encryptFile from "../crypto/encryptFile";

export default async function run(params: WorkerTask) {
  const { taskType, filePath, tempPath, blockSize, port } = params;
  try {
    if (taskType === "decrypt" && !params.blockSize) {
      throw new Error("Block size is required for decryption.");
    }
    const handlerFunction = taskType === "encrypt" ? encryptFile : decryptFile;
    await handlerFunction({
      filePath,
      onProgress: (processedBytes) => {
        port.postMessage({
          type: "progress",
          processedBytes,
        });
      },
      SECRET_KEY: params.SECRET_KEY as Buffer, // Expected to be Uint8Array viewing a SharedArrayBuffer
      enableLogging: params.enableLogging,
      blockSize,
      tempPath,
    });

    return true;
  } catch (error) {
    port.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
