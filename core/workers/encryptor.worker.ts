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

    port.postMessage({ type: "done" });
    return true;
  } catch (error) {
    // Send error back to the main thread
    let e: string | Error = String(error);

    // If it's an Error object, extract its message and stack
    if (error instanceof Error) {
      e = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }

    // Send the error back to the main thread
    port.postMessage({
      type: "error",
      error: e,
    });
  }
}
