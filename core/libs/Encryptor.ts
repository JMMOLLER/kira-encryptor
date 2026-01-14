import type { StructuredSerializeOptions } from "worker_threads";
import type { Internal, Types } from "../types";

import { FILE_EXTENSION, FILE_MAGIC } from "../crypto/constants/base";
import generateSecretKey from "../crypto/generateSecretKey";
import { MessageChannel } from "worker_threads";
import encryptText from "../crypto/encryptText";
import decryptText from "../crypto/decryptText";
import { FileSystem } from "./FileSystem";
import * as utils from "../utils/index";
import { env } from "../configs/env";
import parser from "filesize-parser";
import sodium from "sodium-native";
import Storage from "./Storage";
import hidefile from "hidefile";
import Piscina from "piscina";
import pLimit from "p-limit";
import { tmpdir } from "os";
import path from "path";

type MessageType = "progress" | "done" | "error";
type Message = { type: MessageType; [x: string]: any };

class Encryptor {
  private static workerPool: Piscina<Types.WorkerTask, void>;
  private static readonly FS = FileSystem.getInstance();
  private static readonly tempDir = tmpdir();
  private ENCODING!: Types.BufferEncoding;
  private DEFAULT_STEP_DELAY!: number;
  private ALLOW_EXTRA_PROPS!: boolean;
  private static STORAGE: Storage;
  /**
   * Should be used as Uint8Array viewing a SharedArrayBuffer.
   */
  private readonly SECRET_KEY: Uint8Array;
  private MAX_THREADS!: number;
  private LOG: boolean = false;
  private workerPath!: string;
  private SILENT!: boolean;
  /* ========================== ENCRYPT PROPERTIES ========================== */

  /* ========================== DECRYPT PROPERTIES ========================== */
  private readonly chunkSize = parser("512KiB");
  /* ========================== COMMON PROPERTIES ========================== */
  private stepDelay = this.DEFAULT_STEP_DELAY;
  private renameStep?: Types.CliSpinner;
  private removeStep?: Types.CliSpinner;
  private saveStep?: Types.CliSpinner;
  private copyStep?: Types.CliSpinner;
  private totalFolderBytes = 0;
  private processedBytes = 0;

  private constructor(password: Buffer, storageHeader: Types.StorageHeader) {
    // generate secret key from passphrase and storage header
    const { KEY, keyVerifier } = generateSecretKey(password, storageHeader);
    // Update verifier in storage if it was not set
    if (!storageHeader.verifier) Encryptor.STORAGE.updateVerifier(keyVerifier);

    const sab = new SharedArrayBuffer(KEY.length); // Create SharedArrayBuffer
    this.SECRET_KEY = new Uint8Array(sab); // Create Uint8Array with underlying SharedArrayBuffer
    this.SECRET_KEY.set(KEY); // Copy secret key into the SharedArrayBuffer
  }

  /**
   * @description `[ENG]` Initializes the Encryptor instance and the storage.
   * @description `[ES]` Inicializa la instancia de Encryptor y el almacenamiento.
   * @param password `string` - The password used to generate a derived secret key. **The value will be zeroed out after use.**
   * @param workerPath `string` - The path to the worker script for encryption/decryption.
   * @see See the root `package.json` for worker paths.
   */
  static async init(
    password: Buffer,
    workerPath: string,
    options?: Types.EncryptorOptions
  ): Promise<Encryptor>;
  static async init(
    password: Buffer,
    workerPath?: undefined,
    options?: Types.EncryptorOptions
  ): Promise<Types.BasicEncryptor>;
  static async init(
    password: Buffer,
    workerPath?: string,
    options?: Types.EncryptorOptions
  ): Promise<Encryptor | Types.BasicEncryptor> {
    Encryptor.STORAGE = new Storage(options?.dbPath);
    await Encryptor.STORAGE.ready;

    const storageContent = Encryptor.STORAGE.getStorageContent();
    if (storageContent instanceof Error) {
      return Promise.reject(storageContent);
    }

    const instance = new Encryptor(password, storageContent.header);
    instance.DEFAULT_STEP_DELAY = options?.minDelayPerStep || 300;
    instance.ALLOW_EXTRA_PROPS = options?.allowExtraProps || false;
    instance.MAX_THREADS = options?.maxThreads || env.MAX_THREADS;
    instance.ENCODING = options?.encoding || env.ENCODING;
    instance.stepDelay = instance.DEFAULT_STEP_DELAY;
    instance.LOG = options?.enableLogging || env.LOG;
    instance.SILENT = options?.silent || false;

    if (!workerPath) {
      return {
        getStorage: instance.getStorage,
        revealStoredItem: instance.revealStoredItem.bind(instance),
        hideStoredItem: instance.hideStoredItem.bind(instance),
      };
    }

    instance.workerPath = workerPath;

    // Initialize worker pool
    instance.startWorkerPool();

    return instance;
  }

  /**
   * @description `[ENG]` Starts the worker pool for encrypting and decrypting files.
   * @description `[ES]` Inicia el grupo de workers para cifrar y descifrar archivos.
   */
  private startWorkerPool() {
    if (!Encryptor.workerPool) {
      Encryptor.workerPool = new Piscina({
        maxThreads: this.MAX_THREADS,
        concurrentTasksPerWorker: 1,
        filename: this.workerPath,
        idleTimeout: 30000,
        minThreads: 1,
      });
    }
  }

  /**
   * @description `[ENG]` Destroys the worker pool and cleans up resources.
   * @description `[ES]` Destruye el grupo de trabajadores y limpia los recursos.
   */
  async destroy() {
    if (Encryptor.workerPool) {
      await Encryptor.workerPool.destroy();
      Encryptor.workerPool = undefined as any;
    }
  }

  private resetFileIndicators() {
    this.totalFolderBytes = 0;
    this.processedBytes = 0;
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async visibilityHelper(itemId: string) {
    // Get extension regex
    const EXT_REGEX = new RegExp(`${this.escapeRegExp(FILE_EXTENSION)}$`);
    // Get id without extension
    const id = path.basename(itemId).replace(/^\./, "").replace(EXT_REGEX, "");
    // Get item from storage
    const item = await Encryptor.STORAGE.get(id);

    if (!item) {
      throw new Error("No se encontró el elemento en el almacenamiento.");
    }

    const name = item.isHidden ? `.${id}` : id;
    const finalName = item.type === "file" ? `${name}${FILE_EXTENSION}` : name;
    const itemPath = item.path.replace(path.basename(item.path), finalName);

    return { item, itemPath };
  }

  async hideStoredItem(itemId: string) {
    try {
      const { item, itemPath } = await this.visibilityHelper(itemId);
      if (item.isHidden) return true;

      const newPath = hidefile.hideSync(itemPath);
      if (typeof newPath !== "string") {
        throw new Error("El resultado obtenido no es el esperado.");
      }

      item.isHidden = true;
      await Encryptor.STORAGE.update(item._id, item);
      return true;
    } catch (err) {
      console.error("Error al ocultar el archivo:", err);
      return false;
    }
  }

  async revealStoredItem(itemId: string) {
    try {
      const { item, itemPath } = await this.visibilityHelper(itemId);
      if (!item.isHidden) return true;

      const newPath = hidefile.revealSync(itemPath);
      if (typeof newPath !== "string") {
        throw new Error("El resultado obtenido no es el esperado.");
      }

      item.isHidden = false;
      await Encryptor.STORAGE.update(item._id, item);
      return true;
    } catch (err) {
      console.error("Error al revelar el archivo:", err);
      return false;
    }
  }

  /**
   * @description `[ENG]` Retrieves all encrypted items from storage.
   * @description `[ES]` Recupera todos los elementos cifrados del almacenamiento.
   */
  async getStorage() {
    return await Encryptor.STORAGE.getAll();
  }

  /**
   * @description `[ENG]` Encrypts a file using the secret key and saves it with a new name.
   * @description `[ES]` Cifra un archivo utilizando la clave secreta y lo guarda con un nuevo nombre.
   */
  async encryptFile(props: Types.FileEncryptor) {
    try {
      await Encryptor.STORAGE.ready; // Ensure storage is ready

      const stats = Encryptor.FS.getStatFile(props.filePath);
      if (!stats.isFile()) {
        return Promise.reject(
          new Error("La ruta proporcionada no es un archivo válido.")
        );
      }

      return this._encryptFile({
        ...props,
        isInternalFlow: false,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private async _encryptFile(props: Internal.FileEncryptor) {
    const { filePath, onProgress, isInternalFlow } = props;
    let error: Error | undefined = undefined;

    // Check if file is already encrypted
    const magic = Encryptor.FS.readMagic(filePath);
    // check magic bytes
    if (magic.equals(FILE_MAGIC)) {
      const error = new Error(
        `Cannot re-encrypt file '${path.basename(
          filePath
        )}' because it is already encrypted.`
      );
      error.name = "FileAlreadyEncrypted";
      return Promise.reject(error);
    } else if (
      filePath.includes(`${FILE_EXTENSION}.enc.log`) ||
      filePath.includes(`${FILE_EXTENSION}.dec.log`)
    ) {
      // skip logs file
      return Promise.reject(
        "El archivo no puede ser cifrado porque es un archivo de registro."
      );
    }

    const fileStats = Encryptor.FS.getStatFile(filePath);
    if (!isInternalFlow) this.processedBytes = 0;
    const totalFileSize = fileStats.size;

    // Temp route and final route
    const fileDir = path.dirname(filePath);
    const fileBaseName = path.basename(filePath, path.extname(filePath));
    const tempPath = path.join(
      Encryptor.tempDir,
      `${fileBaseName}-${utils.generateUID()}${FILE_EXTENSION}.tmp`
    );

    const channel = new MessageChannel();
    let handler: undefined | ((m: Message) => void);
    try {
      const messagePromise = new Promise<void>((resolve, reject) => {
        handler = (message) => {
          try {
            switch (message.type) {
              case "progress": {
                const { processedBytes } = message;
                this.processedBytes += processedBytes;
                onProgress?.(this.processedBytes, totalFileSize);
                break;
              }

              // close port is not needed here, will be closed in finally
              case "error": {
                // initially create a generic error
                let err = new Error(message.error);
                // if error object is provided, reconstruct the Error
                if (typeof message.error === "object") {
                  err = Object.assign(new Error(message.error.message), {
                    name: message.error.name,
                    stack: message.error.stack,
                  });
                }
                reject(err);
                break;
              }

              case "done": {
                resolve();
                break;
              }

              default:
                console.warn("Unknown message type:", message);
            }
          } catch (err) {
            reject(err as Error);
          }
        };

        // Register handler
        channel.port2.on("message", handler);
      });

      if (!Encryptor.workerPool) {
        this.startWorkerPool();
      }

      await Promise.race([
        Encryptor.workerPool.run(
          {
            SECRET_KEY: this.SECRET_KEY,
            blockSize: this.chunkSize,
            enableLogging: this.LOG,
            taskType: "encrypt",
            port: channel.port1,
            tempPath,
            filePath,
          },
          {
            transferList: [channel.port1] as StructuredSerializeOptions,
          }
        ),
        messagePromise,
      ]);

      const fileItem = (await this.onEncryptWriteStreamFinish({
        isInternalFlow: !!isInternalFlow,
        extraProps: props.extraProps,
        tempPath: tempPath,
        fileBaseName,
        fileStats,
        fileDir,
        filePath,
      })) as Types.FileItem;

      return Promise.resolve(fileItem);
    } catch (err) {
      error = err as Error;
      return Promise.reject(err);
    } finally {
      // Clean up message handler
      handler && channel.port2.removeListener("message", handler);

      // Close ports
      channel.port1.close();
      channel.port2.close();

      // Call onEnd callback
      if (props.onEnd) props.onEnd(error);
      if (!isInternalFlow) {
        await this.destroy(); // Destroy worker pool if not in internal flow
      }
    }
  }

  /**
   * @description `[ENG]` Decrypts a file using the secret key and saves it with the original name.
   * @description `[ES]` Descifra un archivo utilizando la clave secreta y lo guarda con el nombre original.
   */
  async decryptFile(props: Types.FileDecryptor) {
    try {
      await Encryptor.STORAGE.ready; // Ensure storage is ready

      const stats = Encryptor.FS.getStatFile(props.filePath);
      if (!stats.isFile()) {
        return Promise.reject(
          new Error("La ruta proporcionada no es un archivo válido.")
        );
      }

      return this._decryptFile({
        ...props,
        isInternalFlow: false,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private async _decryptFile(props: Internal.FileDecryptor) {
    const { filePath, fileItem, onProgress, isInternalFlow } = props;
    let error: Error | undefined = undefined;
    // skip logs file
    if (filePath.includes(`${FILE_EXTENSION}.enc.log`))
      return Promise.resolve();
    if (filePath.includes(`${FILE_EXTENSION}.dec.tmp`))
      return Promise.resolve();
    if (path.extname(filePath) !== FILE_EXTENSION) return Promise.resolve();

    if (!isInternalFlow) this.processedBytes = 0;
    const fileStats = Encryptor.FS.getStatFile(filePath);
    const totalFileSize = fileStats.size;

    const blockSize = this.chunkSize + sodium.crypto_secretbox_MACBYTES;

    const tempPath = path.join(
      Encryptor.tempDir,
      path
        .basename(filePath)
        .replace(FILE_EXTENSION, `${FILE_EXTENSION}.dec.tmp`)
    );

    const channel = new MessageChannel();
    let handler: undefined | ((m: Message) => void);
    try {
      const messagePromise = new Promise<void>((resolve, reject) => {
        handler = (message) => {
          try {
            switch (message.type) {
              case "progress": {
                const { processedBytes } = message;
                this.processedBytes += processedBytes;
                onProgress?.(this.processedBytes, totalFileSize);
                break;
              }

              case "error": {
                channel.port2.close();
                reject(new Error(message.error));
                break;
              }

              case "done": {
                resolve();
                break;
              }

              default:
                console.warn("Unknown message type:", message);
            }
          } catch (err) {
            reject(err as Error);
          }
        };

        // Register handler
        channel.port2.on("message", handler);
      });

      if (!Encryptor.workerPool) {
        this.startWorkerPool();
      }

      await Promise.race([
        Encryptor.workerPool.run(
          {
            filePath: filePath,
            SECRET_KEY: this.SECRET_KEY,
            enableLogging: this.LOG,
            port: channel.port1,
            taskType: "decrypt",
            blockSize,
            tempPath,
          },
          {
            transferList: [channel.port1] as StructuredSerializeOptions,
          }
        ),
        messagePromise,
      ]);

      const outPath = isInternalFlow && fileItem ? fileItem.path : undefined;
      await this.onDecryptWriteStreamFinish({
        isInternalFlow: !!isInternalFlow,
        folderPath: filePath,
        fileItem,
        outPath,
        tempPath,
      });

      return Promise.resolve();
    } catch (err) {
      error = err as Error;
      return Promise.reject(err);
    } finally {
      // Clean up message handler
      handler && channel.port2.removeListener("message", handler);

      // Close ports
      channel.port1?.close();
      channel.port2.close();

      // Call onEnd callback
      if (props.onEnd) props.onEnd(error);
      if (!isInternalFlow) {
        await this.destroy(); // Destroy worker pool if not in internal flow
      }
    }
  }

  /**
   * @description `[ENG]` Recursively encrypts all files within a folder.
   * @description `[ES]` Cifra recursivamente todos los archivos dentro de una carpeta.
   */
  async encryptFolder(props: Types.FolderEncryptor) {
    try {
      await Encryptor.STORAGE.ready; // Ensure storage is ready

      const stats = Encryptor.FS.getStatFile(props.folderPath);
      if (stats.isFile()) {
        return Promise.reject(
          new Error("La ruta proporcionada no es un archivo válido.")
        );
      }

      return this._encryptFolder({
        ...props,
        isInternalFlow: false,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private async _encryptFolder(props: Internal.FolderEncryptor) {
    const { folderPath, onProgress, isInternalFlow } = props;

    const baseName = path.basename(folderPath);
    let tempPath = folderPath;

    // Only check for existing encrypted folder in non-internal flow
    // Prevents larger overhead in recursive calls
    // If a folder containing an encrypted file exists, then the entire operation will be canceled.
    if (!isInternalFlow && (await Encryptor.STORAGE.get(baseName))) {
      const error = new Error(
        `Cannot re-encrypt folder with name '${baseName}' because it is already exists in storage.`
      );
      error.name = "FolderAlreadyEncrypted";
      return Promise.reject(error);
    }

    // Create a temporary copy of the folder if not in internal flow
    if (!isInternalFlow) {
      tempPath = path.join(Encryptor.tempDir, baseName);
      const exist = Encryptor.FS.itemExists(tempPath);
      if (exist) {
        await Encryptor.FS.removeItem(tempPath);
      }
      await Encryptor.FS.copyItem(folderPath, tempPath);
    } else if (props.tempPath) {
      tempPath = props.tempPath; // Use provided tempPath in internal flow
    }

    // 1. Read and sort directory entries: directories first, then files alphabetically
    const entries = Encryptor.FS.readDir(tempPath);
    entries.sort((a, b) => {
      if (a.isDirectory() && b.isFile()) return -1;
      if (a.isFile() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    // 2. If not an internal (recursive) call
    if (!isInternalFlow) {
      // bcs we not show the spinner in internal flow
      this.totalFolderBytes = Encryptor.FS.getFolderSize(tempPath);
      this.stepDelay = 0;
    }

    // 3. Create a p-limit instance to restrict concurrency
    const minTasks = Math.min(this.MAX_THREADS, entries.length);
    const limit = pLimit(
      Math.max(1, minTasks) // Ensure at least 1 thread
    );

    // --------------------
    // PHASE A: Process subfolders first (DFS)
    // --------------------
    const subfolderPromises: Promise<Types.FolderItem | null>[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subfolderTask = limit(async () => {
          // Recursively encrypt subfolder
          return await this._encryptFolder({
            isInternalFlow: true,
            folderPath: path.join(folderPath, entry.name),
            tempPath: path.join(tempPath, entry.name),
            onProgress,
          });
        });
        subfolderPromises.push(subfolderTask);
      }
    }

    // Wait for ALL subfolder tasks to finish (or abort on first error)
    const subfolderResults = await Promise.all(subfolderPromises);
    // At this point, subfolderResults is Types.FolderItem[]

    // --------------------
    // PHASE B: Process files in this folder
    // --------------------
    const subfolders: Types.FolderItem[] = subfolderResults.filter(
      (item): item is Types.FolderItem => item !== null
    );

    // ------------- FASE B: Procesar ARCHIVOS -------------
    // Ahora que todas las subcarpetas profundas fueron procesadas, encriptamos archivos
    const filePromises: Promise<Types.FileItem | null>[] = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        if (
          entry.name.includes(`${FILE_EXTENSION}.enc.log`) ||
          entry.name.includes(`${FILE_EXTENSION}.dec.log`)
        ) {
          continue; // Skip log files
        }
        const fullPath = path.join(tempPath, entry.name);
        const fileTask = limit(async () => {
          try {
            // Encrypt the file (this function already updates processedBytes)
            const subFile = await this._encryptFile({
              filePath: fullPath,
              isInternalFlow: true,
              onProgress: () => {
                onProgress?.(this.processedBytes, this.totalFolderBytes);
              },
            });
            subFile.path = subFile.path.replace(tempPath, folderPath);
            return subFile;
          } catch (err) {
            // Propagate any other error to abort everything
            throw err;
          }
        });
        filePromises.push(fileTask);
      }
    }

    // Wait for ALL file tasks to finish (or abort on first error)
    const fileResults = await Promise.all(filePromises);
    const files: Types.FileItem[] = fileResults.filter(
      (item): item is Types.FileItem => item !== null
    );

    // --------------------
    // PHASE C: Build the content array (subfolders first, then files)
    // --------------------
    const content: (Types.FileItem | Types.FolderItem)[] = [
      ...subfolders,
      ...files,
    ];

    // --------------------
    // PHASE D: Encrypt current folder’s name & register
    // --------------------
    const encryptedName = encryptText(
      baseName,
      this.SECRET_KEY as Buffer,
      this.ENCODING
    );
    let saved: Types.StorageItem = {
      originalName: baseName,
      size: this.totalFolderBytes,
      encryptedAt: new Date(),
      _id: utils.generateUID(),
      path: folderPath,
      type: "folder",
      encryptedName,
      content,
    };

    if (!isInternalFlow) {
      // Restore default delay
      this.stepDelay = this.DEFAULT_STEP_DELAY;
      if (!this.SILENT) {
        this.saveStep = utils.createSpinner(
          "Registrando carpeta encriptada..."
        );
      }
      if (this.ALLOW_EXTRA_PROPS && props.extraProps) {
        saved.extraProps = props.extraProps;
      } else if (props.extraProps && !this.ALLOW_EXTRA_PROPS) {
        utils
          .createSpinner(
            "Propiedades extra no permitidas. Configura 'allowExtraProps' a true."
          )
          .warn();
      }

      // Save to storage, then mark spinner as succeeded
      await Promise.all([
        Encryptor.STORAGE.set(saved),
        utils.delay(this.stepDelay),
      ]).then(([storageItem]) => {
        saved = storageItem;
        this.saveStep?.succeed("Carpeta encriptada registrada correctamente.");
      });
    }

    // --------------------
    // PHASE E: Rename/move the original folder to encrypted ID
    // --------------------
    const encryptedPath = path.join(path.dirname(tempPath), saved._id);
    await Encryptor.FS.safeRename(tempPath, encryptedPath);

    // --------------------
    // PHASE F: Final callbacks and cleanup
    // --------------------
    if (!isInternalFlow) {
      const mvStep = !this.SILENT
        ? utils.createSpinner(
            `Remplazando carpeta original por la encriptada...`
          )
        : undefined;
      try {
        const destEncryptedFolder = folderPath.replace(baseName, saved._id);
        await Encryptor.FS.copyItem(encryptedPath, destEncryptedFolder);
        await Encryptor.FS.removeItem(encryptedPath);
        await Encryptor.FS.removeItem(folderPath);
        mvStep?.succeed("Carpeta original reemplazada por la encriptada.");
        props.onEnd?.();
      } catch (err) {
        await Encryptor.FS.removeItem(encryptedPath).catch(() => {});
        mvStep?.fail("Error al reemplazar la carpeta original.");
        return Promise.reject(err);
      } finally {
        this.resetFileIndicators();
        await this.destroy();
      }
    }

    return Promise.resolve(saved);
  }

  /**
   * @description `[ENG]` Recursively decrypts all files within a folder.
   * @description `[ES]` Descifra recursivamente todos los archivos dentro de una carpeta.
   */
  async decryptFolder(props: Types.FolderDecryptor) {
    try {
      await Encryptor.STORAGE.ready; // Ensure storage is ready

      const stats = Encryptor.FS.getStatFile(props.folderPath);
      if (stats.isFile()) {
        return Promise.reject(
          new Error("La ruta proporcionada no es un archivo válido.")
        );
      }

      return this._decryptFolder({
        ...props,
        isInternalFlow: false,
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
  private async _decryptFolder(props: Internal.FolderDecryptor) {
    const { folderPath, onProgress, isInternalFlow, folderItem, onEnd } = props;
    let error: Error | undefined = undefined;

    // If not in internal flow, initialize indicators
    if (!isInternalFlow) {
      this.stepDelay = 0;
      this.totalFolderBytes = Encryptor.FS.getFolderSize(folderPath);
    }

    // Retrieve folder metadata from storage if not provided
    const baseName = path.basename(folderPath);
    const storedItem = await Encryptor.STORAGE.get(baseName);
    const currentFolder = folderItem || storedItem;

    if (!currentFolder || currentFolder.type !== "folder") {
      throw new Error(`Folder not found in storage: ${baseName}`);
    }

    // The content is already ordered ([subfolders..., files...]) per encryptFolder
    const contentItems = currentFolder.content;

    // Create p-limit instance with max threads = min(MAX_THREADS, number of items)
    const minTasks = Math.min(this.MAX_THREADS, contentItems.length);
    const limit = pLimit(
      Math.max(1, minTasks) // Ensure at least 1 thread
    );

    // --------------------
    // PHASE A: Process subfolders in parallel (DFS)
    // --------------------
    const subfolderPromises: Promise<string | null>[] = [];

    for (const item of contentItems) {
      if (item.type === "folder") {
        const fullPath = path.join(folderPath, item._id); // encrypted folder is named by item.id
        const task = limit(async () => {
          return this._decryptFolder({
            folderPath: fullPath,
            isInternalFlow: true,
            folderItem: item,
            onProgress,
          });
        });
        subfolderPromises.push(task);
      }
    }

    // Wait for all subfolders to finish decrypting
    await Promise.all(subfolderPromises);

    // --------------------
    // PHASE B: Process files in parallel
    // --------------------
    const filePromises: Promise<void>[] = [];

    for (const item of contentItems) {
      if (item.type === "file") {
        const encryptedFilePath = path.join(
          folderPath,
          item._id + FILE_EXTENSION
        );
        const task = limit(async () => {
          try {
            // decryptFile uses workerPool internally
            await this._decryptFile({
              filePath: encryptedFilePath,
              isInternalFlow: true,
              fileItem: item,
              onProgress: () => {
                onProgress?.(this.processedBytes, this.totalFolderBytes);
              },
            });
          } catch (err) {
            throw err; // Propagate error to abort everything
          }
        });
        filePromises.push(task);
      }
    }

    await Promise.all(filePromises);

    // --------------------
    // PHASE C: Decrypt current folder name, rename, and remove from storage
    // --------------------
    const originalName = decryptText(
      currentFolder.encryptedName,
      this.SECRET_KEY as Buffer,
      this.ENCODING
    );

    if (!originalName) {
      if (!this.SILENT) {
        utils
          .createSpinner(`Could not decrypt folder name: ${currentFolder._id}`)
          .warn();
      }
      // If unable to decrypt folder name, return original path
      return folderPath;
    }

    const decryptedPath = path.join(path.dirname(folderPath), originalName);

    try {
      if (!isInternalFlow) {
        if (!this.SILENT) {
          this.removeStep = utils.createSpinner(
            "Eliminando carpeta encriptada..."
          );
        }
        // Rename folder in file system
        await Encryptor.FS.removeItem(folderPath);
        this.removeStep?.succeed("Carpeta encriptada eliminada correctamente.");
      }
      // Remove folder entry from storage
      await Encryptor.STORAGE.delete(currentFolder._id);
    } catch (err) {
      if (!isInternalFlow && this.removeStep) {
        this.removeStep.fail("Error al eliminar la carpeta encriptada.");
      }
      error = err as Error;
      console.error(err);
      // If rename or delete fails, return original path
      return folderPath;
    } finally {
      if (!isInternalFlow) {
        onEnd?.(error);
        this.resetFileIndicators();
        await this.destroy();
      }
    }

    return decryptedPath;
  }

  /* ========================== STREAM HANDLERS ========================== */
  private async onEncryptWriteStreamFinish(
    props: Types.EncryptWriteStreamFinish
  ): Promise<Types.StorageItem> {
    const { filePath, tempPath, fileDir, fileStats, fileBaseName } = props;
    let savedItem: Types.FileItem | undefined = undefined;

    try {
      if (!fileBaseName) {
        throw new Error("No se pudo obtener el nombre base del archivo.");
      } else if (!fileStats) {
        throw new Error("No se pudo obtener la información del archivo.");
      } else if (!fileDir) {
        throw new Error("No se pudo obtener la ruta del archivo.");
      } else if (!tempPath) {
        throw new Error("No se pudo obtener la ruta temporal del archivo.");
      }

      const encryptedName = encryptText(
        fileBaseName,
        this.SECRET_KEY as Buffer,
        this.ENCODING
      );
      savedItem = {
        encryptedName,
        originalName: path.basename(filePath),
        path: path.resolve(filePath),
        size: fileStats.size,
        encryptedAt: new Date(),
        _id: utils.generateUID(),
        type: "file",
      };
      if (!props.isInternalFlow) {
        if (!this.SILENT) {
          this.saveStep = utils.createSpinner(
            "Registrando archivo encriptado..."
          );
        }
        if (this.ALLOW_EXTRA_PROPS && props.extraProps) {
          savedItem.extraProps = props.extraProps;
        } else if (props.extraProps && !this.ALLOW_EXTRA_PROPS) {
          utils
            .createSpinner(
              "Propiedades extra no permitidas. Configura 'allowExtraProps' a true."
            )
            .warn();
        }
        await Promise.all([
          Encryptor.STORAGE.set(savedItem),
          utils.delay(this.stepDelay),
        ]).then(([storageItem]) => {
          this.saveStep?.succeed(
            "Archivo encriptado registrado correctamente."
          );
          savedItem = storageItem;
        });
      }
      const encryptedFileName = savedItem._id + FILE_EXTENSION;
      const renamedTempFile = path.join(Encryptor.tempDir, encryptedFileName);
      const destPath = path.join(fileDir, encryptedFileName);

      // Rename the temp file to the final file name
      if (!props.isInternalFlow && !this.SILENT) {
        this.renameStep = utils.createSpinner(
          "Renombrando archivo encriptado..."
        );
      }
      await Promise.all([
        Encryptor.FS.safeRename(tempPath, renamedTempFile),
        utils.delay(this.stepDelay),
      ]).then(() => {
        this.renameStep?.succeed(
          "Archivo encriptado renombrado correctamente."
        );
      });

      // Move the temp file to the final destination
      if (!props.isInternalFlow && !this.SILENT) {
        this.copyStep = utils.createSpinner("Moviendo archivo encriptado...");
      }
      await Promise.all([
        Encryptor.FS.copyItem(renamedTempFile, destPath),
        utils.delay(this.stepDelay),
      ]).then(() => {
        this.copyStep?.succeed("Archivo encriptado movido correctamente.");
      });

      // Remove the original file and temp file
      if (!props.isInternalFlow && !this.SILENT) {
        this.removeStep = utils.createSpinner("Eliminando archivo original...");
      }
      await Promise.all([
        Encryptor.FS.removeItem(filePath),
        Encryptor.FS.removeItem(renamedTempFile),
        utils.delay(this.stepDelay),
      ]).then(() => {
        this.removeStep?.succeed("Archivo original eliminado correctamente.");
      });

      return savedItem;
    } catch (err) {
      if (props.isInternalFlow && savedItem)
        await Encryptor.STORAGE.delete(savedItem._id);

      if (!props.isInternalFlow && this.saveStep)
        this.saveStep.fail("Error al registrar el archivo.");
      if (!props.isInternalFlow && this.renameStep)
        this.renameStep.fail("Error al renombrar el archivo.");
      if (!props.isInternalFlow && this.copyStep)
        this.copyStep.fail("Error al mover el archivo.");
      if (!props.isInternalFlow && this.removeStep)
        this.removeStep.fail("Error al eliminar el archivo original.");

      throw err;
    }
  }

  private async onDecryptWriteStreamFinish(
    params: Types.DecryptWriteStreamFinish
  ) {
    const { folderPath, isInternalFlow, tempPath, fileItem, outPath } = params;
    let error: Error | undefined = undefined;

    try {
      if (!tempPath) {
        throw new Error("No se pudo obtener la ruta temporal del archivo.");
      }

      // Get extension regex
      const EXT_REGEX = new RegExp(`${this.escapeRegExp(FILE_EXTENSION)}$`);
      // Get file name without extension
      const fileName = path.basename(folderPath).replace(EXT_REGEX, "");

      const storedItem = await Encryptor.STORAGE.get(fileName);
      const { originalName } = fileItem || storedItem || {};
      const originalFileName = originalName;

      if (!originalFileName) {
        throw new Error("No se pudo descifrar el nombre del archivo.");
      }

      const restoredPath = (outPath ? outPath : folderPath).replace(
        path.basename(outPath ? outPath : folderPath),
        originalFileName
      );
      const tempFileSize = Encryptor.FS.getStatFile(tempPath).size;
      let inputBuffer: NonSharedBuffer | string = tempPath;
      // If the file is smaller than `kMaxLength`, read it directly
      if (tempFileSize < Encryptor.FS.kMaxLength) {
        inputBuffer = Encryptor.FS.readFile(tempPath);
      }

      if (!isInternalFlow && !this.SILENT) {
        this.renameStep = utils.createSpinner(
          "Remplazando archivo original..."
        );
      }
      await Promise.all([
        Encryptor.FS.replaceFile(tempPath, restoredPath, inputBuffer),
        utils.delay(this.stepDelay),
      ]).then(() => {
        this.renameStep?.succeed("Archivo original reemplazado correctamente.");
      });

      if (!outPath) {
        if (!isInternalFlow && !this.SILENT) {
          this.removeStep = utils.createSpinner(
            "Eliminando archivo temporal..."
          );
        }
        await Promise.all([
          Encryptor.FS.removeItem(folderPath),
          utils.delay(this.stepDelay),
        ]).then(() => {
          this.removeStep?.succeed("Archivo temporal eliminado correctamente.");
        });
      }

      if (!isInternalFlow) {
        if (!this.SILENT) {
          this.saveStep = utils.createSpinner(
            "Eliminando archivo del registro..."
          );
        }
        await Promise.all([
          Encryptor.STORAGE.delete(fileName),
          utils.delay(this.stepDelay),
        ]).then(() => {
          this.saveStep?.succeed("Archivo eliminado del registro.");
        });
      }

      return Promise.resolve();
    } catch (err) {
      error = err as Error;

      if (!isInternalFlow && this.renameStep)
        this.renameStep.fail("Error al reemplazar el archivo original.");
      if (!isInternalFlow && this.removeStep)
        this.removeStep.fail("Error al eliminar el archivo temporal.");
      if (!isInternalFlow && this.saveStep)
        this.saveStep.fail("Error al eliminar el archivo del registro.");

      if (tempPath) await Encryptor.FS.removeItem(tempPath);
      return Promise.reject(error);
    }
  }
}

export default Encryptor;
