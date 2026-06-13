import type { ReadStreamOptions, WriteStreamOptions } from "../types/internal";
import { formatBytes, delay } from "../utils/index";
import { Readable, pipeline as p } from "stream";
import parse from "filesize-parser";
import { promisify } from "util";
import path from "path";
import fs from "fs";

// TODO: Add a function to check if a file or directory is locked.
// TODO: agregar una funcion para bloquear un archivo o directorio.

const pipeline = promisify(p);

export class FileSystem {
  private static instance: FileSystem;
  readonly kMaxLength = parse("2GiB"); // Maximum file size to read in memory for x64 architectures.

  private constructor() {}

  static getInstance(): FileSystem {
    if (!FileSystem.instance) {
      FileSystem.instance = new FileSystem();
    }
    return FileSystem.instance;
  }

  /**
   * @description `[ENG]` Get the file statistics of a file.
   * @description `[ESP]` Obtiene las estadísticas del archivo de un archivo.
   * @param path `string` - The path of the file to be checked.
   */
  getStatFile(path: string) {
    if (!fs.existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    return fs.statSync(path);
  }

  /**
   * @description `[ENG]` Get the size of a folder and its contents.
   * @description `[ESP]` Obtiene el tamaño de una carpeta y su contenido.
   * @param dirPath `string` - The path of the directory to be checked.
   */
  getFolderSize(dirPath: string) {
    let totalSize = 0;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile()) {
        const stats = this.getStatFile(fullPath);
        totalSize += stats.size;
      } else if (entry.isDirectory()) {
        totalSize += this.getFolderSize(fullPath);
      }
    }

    return totalSize;
  }

  /**
   * @description `[ENG]` Create a file in the filesystem. If the file already exists, it will be overwritten.
   * @description `[ESP]` Crea un archivo en el sistema de archivos. Si el archivo ya existe, lo sobrescribe.
   * @param dirPath - The path of the directory where the file will be created, including the file name and extension.
   * @param content - The content to be written to the file.
   * @param syncToDisk - Whether to synchronize the file to disk after writing (default: false).
   */
  async createFile(
    dirPath: string,
    content: Uint8Array | string,
    syncToDisk = false
  ): Promise<void> {
    const file = await fs.promises.open(dirPath, "w");

    try {
      await file.writeFile(content);

      if (syncToDisk) {
        await file.sync(); // Ensure data is flushed to disk
      }
    } finally {
      await file.close();
    }
  }

  /**
   * @description `[ENG]` Create a readable stream from a file.
   * @description `[ESP]` Crea un flujo de lectura desde un archivo.
   * @param path `string` - The path of the file to be read.
   * @param highWaterMark `number` - The size of each chunk to be read (optional).
   */
  createReadStream(path: string, options?: ReadStreamOptions) {
    if (!fs.existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    }

    return fs.createReadStream(path, options);
  }

  /**
   * @description `[ENG]` Create a writable stream to a file.
   * @description `[ESP]` Crea un flujo de escritura a un archivo.
   * @param path `string` - The path of the file to be created.
   */
  createWriteStream(path: string, options?: WriteStreamOptions) {
    return fs.createWriteStream(path, options);
  }

  /**
   * @description `[ENG]` Remove a file from the filesystem.
   * @description `[ESP]` Elimina un archivo del sistema de archivos.
   * @param path `string` - The path of the file to be removed.
   * @param retries `number` - The number of retries to attempt if the removal fails (default: 15).
   */
  async removeItem(path: string, retries = 15) {
    if (!fs.existsSync(path)) {
      return Promise.reject(new Error(`Path not found: ${path}`));
    }

    let itemType: "file" | "directory" = "file";
    const stat = this.getStatFile(path);

    for (let i = 0; i < retries; i++) {
      try {
        if (stat.isDirectory()) {
          itemType = "directory";
          fs.rmSync(path, {
            recursive: true,
            force: true,
          });
        } else {
          fs.unlinkSync(path);
        }
        return;
      } catch (error) {
        if (error instanceof Error) {
          await this.printAttempt(
            `remove ${itemType} '${path}'`,
            error,
            i,
            retries
          );
        } else {
          return Promise.reject(error);
        }
      }
    }
  }

  /**
   * @description `[ENG]` Print an attempt message for a file operation.
   * @description `[ESP]` Imprime un mensaje de intento para una operación de archivo.
   * @param text The text to be printed
   * @param error Error object
   * @param retryCount The current retry count
   * @param maxRetries The maximum number of retries
   */
  async printAttempt(
    text: string,
    error: NodeJS.ErrnoException,
    retryCount: number,
    maxRetries: number
  ) {
    if (error.code === "EBUSY" && retryCount < maxRetries) {
      console.log(`Attempt ${retryCount + 1} to ${text} failed.`);
      await delay(100 * (retryCount + 1));
    } else if (error.code === "EPERM") {
      console.error(
        `\n❌ Permission denied to ${text}. Please close any applications using it, try open the script as administrator, or exclude the script from antivirus.`
      );
      return Promise.reject(error);
    } else {
      return Promise.reject(error);
    }
  }

  /**
   * @description `[ENG]` Read a file from the filesystem.
   * @description `[ESP]` Lee un archivo del sistema de archivos.
   * @param path `string` - The path of the file to be read.
   */
  readFile(path: string) {
    if (!fs.existsSync(path)) {
      throw new Error(`File not found: ${path}`);
    } else if (fs.statSync(path).size > this.kMaxLength) {
      throw new Error(
        `File too large to read: ${path}. Maximum size is ${formatBytes(
          this.kMaxLength
        )}. Use createReadStream instead.`
      );
    }

    try {
      return fs.readFileSync(path);
    } catch (error) {
      throw new Error(
        `Error reading file '${path}': ${(error as Error).message}`
      );
    }
  }

  /**
   * @description `[ENG]` Read the magic bytes from a file.
   * @description `[ESP]` Lee los bytes mágicos de un archivo.
   * @param path `string` - The path of the file to be read.
   * @param length `number` - The number of bytes to read (default: 4).
   */
  readMagic(path: string, length = 4): Buffer {
    const fd = fs.openSync(path, "r");
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, 0);
      return buffer;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * @description `[ENG]` Replace a file with a new one.
   * @description `[ESP]` Reemplaza un archivo por uno nuevo.
   * @param prevPath The path of the file to be replaced
   * @param newPath The new path for the file
   * @param data Data to be written to the new file
   */
  async replaceFile(
    source: string,
    newPath: string,
    data: Buffer | Uint8Array | string
  ): Promise<void> {
    try {
      // Determinar si 'data' es un path temporal o contenido en memoria
      const readable =
        typeof data === "string"
          ? fs.createReadStream(data) // Es un archivo temporal
          : Readable.from(data); // Es un buffer/memoria

      const writable = fs.createWriteStream(newPath);
      const dir = path.dirname(newPath);
      if (!this.itemExists(dir)) this.createFolder(dir);
      await pipeline(readable, writable);

      // Solo eliminar si 'source' ≠ 'newPath' y no es el mismo archivo
      if (
        typeof data === "string" && // solo si viene de archivo temporal
        source !== newPath
      ) {
        await fs.promises.unlink(data).catch(() => {}); // Silencioso
      }

      // También eliminar el archivo original (fuente) si es distinto al destino
      if (source !== newPath) {
        await fs.promises.unlink(source).catch(() => {});
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "Unknown error";
      throw new Error(`Error al reemplazar archivo: ${message}`);
    }
  }

  /**
   * @description `[ENG]` Read a directory from the filesystem.
   * @description `[ESP]` Lee un directorio del sistema de archivos.
   * @param folderPath `string` - The path of the folder to be read.
   */
  readDir(folderPath: string) {
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Directory not found: ${folderPath}`);
    }

    try {
      return fs.readdirSync(folderPath, {
        withFileTypes: true,
      });
    } catch (error) {
      throw new Error(
        `Error reading directory '${folderPath}': ${(error as Error).message}`
      );
    }
  }

  /**
   * @description `[ENG]` Rename a folder in the filesystem.
   * @description `[ESP]` Renombra una carpeta en el sistema de archivos.
   * @param folderPath `string` - The path of the folder to be renamed.
   * @param newPath `string` - The new path for the folder.
   */
  private renameItem(folderPath: string, newPath: string) {
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Path not found: ${folderPath}`);
    }

    try {
      fs.renameSync(folderPath, newPath);
    } catch (error) {
      throw error;
    }
  }

  /**
   * @description `[ENG]` Create a folder in the filesystem.
   * @description `[ESP]` Crea una carpeta en el sistema de archivos.
   * @param folderPath `string` - The path of the folder to be created.
   */
  createFolder(folderPath: string) {
    if (fs.existsSync(folderPath)) {
      throw new Error(`Directory already exists: ${folderPath}`);
    }

    try {
      fs.mkdirSync(folderPath, { recursive: true });
    } catch (error) {
      throw new Error(
        `Error creating directory '${folderPath}': ${(error as Error).message}`
      );
    }
  }

  /**
   * @description `[ENG]` Safely rename a folder in the filesystem with retries.
   * @description `[ESP]` Renombra una carpeta de forma segura en el sistema de archivos con reintentos.
   * @param src `string` - The source path of the folder to be renamed.
   * @param dest `string` - The destination path for the renamed folder.
   * @param retries `number` - The number of retries to attempt if the rename fails (default: 20).
   */
  async safeRename(src: string, dest: string, retries = 15): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        this.renameItem(src, dest);
        return;
      } catch (err) {
        if (err instanceof Error) {
          await this.printAttempt(
            `rename folder/file '${src}'`,
            err,
            i,
            retries
          );
        } else {
          return Promise.reject(err);
        }
      }
    }
  }

  async copyItem(src: string, dest: string, retries = 15): Promise<void> {
    const srcStat = this.getStatFile(src);
    let itemType: "file" | "directory" = "file";
    for (let i = 0; i < retries; i++) {
      try {
        if (srcStat.isDirectory()) {
          itemType = "directory";
          fs.cpSync(src, dest, {
            preserveTimestamps: true,
            errorOnExist: false,
            recursive: true,
          });
        } else {
          fs.copyFileSync(src, dest);
        }
        return;
      } catch (err) {
        if (err instanceof Error) {
          await this.printAttempt(`copy ${itemType} '${src}'`, err, i, retries);
        } else {
          return Promise.reject(err);
        }
      }
    }
  }

  itemExists(path: string): boolean {
    try {
      return fs.existsSync(path);
    } catch (error) {
      throw error;
    }
  }
}
