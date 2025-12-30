import type createSpinner from "../utils/createSpinner";
import type { Readable, Writable } from "stream";
import type { Stats } from "fs";

//====================== WORKER TYPES ======================//

export interface WorkerTask {
  taskType: "encrypt" | "decrypt";
  filePath: string;
  enableLogging?: boolean;
  readonly SECRET_KEY: Uint8Array;
  tempPath: string;
  port: MessagePort;
  blockSize: number;
}

//====================== UTIL TYPES ======================//

export type CliSpinner = ReturnType<typeof createSpinner>;

export interface ProgressBar {
  /**
   * Progress value between 0 and 1
   */
  progress: number;
  /**
   * Size of the progress bar
   */
  size: number;
  /**
   * Character to represent the completed part of the progress bar
   */
  completeChar: string;
  /**
   * Character to represent the incomplete part of the progress bar
   */
  incompleteChar: string;
}

export type ProgressCallback = (
  processedBytes: number,
  totalBytes: number
) => void;

//====================== ENCRYPTOR TYPES ======================//

export interface EncryptorOptions {
  /**
   * @description `[ESP]` - Permite modificar el tiempo minimo que se muestra el spinner.
   * @description `[ENG]` - Allows you to modify the minimum time the spinner is shown.
   * @default 300
   */
  minDelayPerStep?: number;

  /**
   * @description `[ESP]` - Indica si debe mostrar mensajes del progreso en la consola.
   * @description `[ENG]` - Indicates whether to show progress messages in the console.
   * @default false
   */
  silent?: boolean;

  /**
   * @description `[ESP]` - Permite modificar la ubicación de la libreria de encryptor.
   * @description `[ENG]` - Allows you to modify the location of the encryptor storage file.
   * @default "./storage.bin"
   */
  dbPath?: string;

  /**
   * @description `[ESP]` - Permite indicar a la clase `Encryptor` que puede guardar propiedades extra en el `Storage`.
   * @description `[ENG]` - Allows the `Encryptor` class to save extra properties in the `Storage`.
   * @default false
   */
  allowExtraProps?: boolean;

  /**
   * @description `[ESP]` - Permite indicar el numero maximo de hilos que se pueden usar para cifrar/descifrar archivos.
   * @description `[ENG]` - Allows you to specify the maximum number of threads that can be used to encrypt/decrypt files.
   * @default 1
   */
  maxThreads?: number;

  /**
   * @description `[ESP]` - Permite crear un archivo de log para cada archivo en la operación de cifrado/descifrado.
   * @description `[ENG]` - Allows creating a log file for each file in the encryption/decryption operation.
   * @default false
   */
  enableLogging?: boolean;

  /**
   * @description `[ESP]` - Permite modificar la codificación con la que se guardan los datos en el `Storage`.
   * @description `[ENG]` - Allows you to modify the encoding with which data is stored in the `Storage`.
   * @default "base64"
   */
  encoding?: BufferEncoding;
}

export type BufferEncoding = "base64" | "base64url" | "hex" | "latin1";

export interface BasicEncryptor {
  getStorage: () => Promise<Map<string, StorageItem>>;
  refreshStorage: () => Promise<void>;
  revealStoredItem: (item: string) => Promise<boolean>;
  hideStoredItem: (item: string) => Promise<boolean>;
}

export interface EncryptorProps {
  /**
   * @description `[ESP]` - Función que se ejecuta cuando se procesa un bloque de datos.
   * @description `[ENG]` - Function that is executed when a block of data is processed.
   */
  onProgress?: ProgressCallback;

  /**
   * @description `[ESP]` - Función que se ejecuta al finalizar el cifrado/descifrado.
   * @description `[ENG]` - Function that is executed when the encryption/decryption ends.
   */
  onEnd?: (error?: Error) => void;
}

export interface FileEncryptor extends EncryptorProps {
  /**
   * @description `[ESP]` - Ruta del archivo a cifrar/descifrar.
   * @description `[ENG]` - Path of the file to encrypt/decrypt.
   */
  filePath: Readonly<string>;

  /**
   * @description `[ESP]` - Permite guardar propiedades extra en el `Storage`.
   * @description `[ENG]` - Allows saving extra properties in the `Storage`.
   * @note `[ESP]` - Para usarse, debe establecer `allowExtraProps` a `true` cuando se inicializa la clase.
   * @note `[ENG]` - To use this, `allowExtraProps` must be set to true when initializing the class.
   */
  extraProps?: Record<string, JsonValue>;
}

export interface FolderEncryptor extends EncryptorProps {
  /**
   * @description `[ESP]` - Ruta de la carpeta a cifrar/descifrar.
   * @description `[ENG]` - Path of the folder to encrypt/decrypt.
   */
  folderPath: Readonly<string>;

  /**
   * @description `[ESP]` - Permite guardar propiedades extra en el `Storage`.
   * @description `[ENG]` - Allows saving extra properties in the `Storage`.
   * @note `[ESP]` - Para usarse, debe establecer `allowExtraProps` a `true` cuando se inicializa la clase.
   * @note `[ENG]` - To use this, `allowExtraProps` must be set to true when initializing the class.
   */
  extraProps?: Record<string, JsonValue>;
}

export interface FileDecryptor extends EncryptorProps {
  /**
   * @description `[ESP]` - Ruta del archivo a cifrar/descifrar.
   * @description `[ENG]` - Path of the file to encrypt/decrypt.
   */
  filePath: Readonly<string>;
}

export interface FolderDecryptor extends EncryptorProps {
  /**
   * @description `[ESP]` - Ruta de la carpeta a cifrar/descifrar.
   * @description `[ENG]` - Path of the folder to encrypt/decrypt.
   */
  folderPath: Readonly<string>;
}

//====================== STREAM TYPES ======================//

export interface StreamHandlerProps {
  /**
   * @description Indicates if the function is called from an internal flow.
   */
  isInternalFlow: boolean;

  logStream?: Writable;
  readStream: Readable;
  writeStream: Writable;
  reject: (error?: any) => void;
  resolve: (value?: any) => void;
  fileItem?: StorageItem;
  fileBaseName: string;
  folderPath: string;
  tempPath: string;
  filePath: string;
  outPath?: string;
  fileDir: string;
  error: Error;
  fileStats: Stats;
  streamName: "writeStream" | "readStream";
  onEnd: FileEncryptor["onEnd"];
  extraProps?: Record<string, JsonValue>;
}

export type EncryptWriteStreamFinish = Pick<
  StreamHandlerProps,
  | "extraProps"
  | "isInternalFlow"
  | "filePath"
  | "tempPath"
  | "fileDir"
  | "fileStats"
  | "fileBaseName"
>;

export type DecryptWriteStreamFinish = Pick<
  StreamHandlerProps,
  "folderPath" | "isInternalFlow" | "tempPath" | "fileItem" | "outPath"
>;

//====================== STORAGE TYPES ======================//

export type JsonPrimitive = string | number | boolean | null | undefined;
export type PrimitiveOrArray = JsonPrimitive | JsonPrimitive[];
export type JsonValue = PrimitiveOrArray | Record<string, PrimitiveOrArray>;

export interface Item {
  extraProps?: Record<string, JsonValue>;
  encryptedName: string;
  originalName?: string;
  encryptedAt?: Date;
  isHidden?: boolean;
  size?: number;
  path: string;
  _id: string;
}

export type FileItem = Item & {
  type: "file";
};

export type FolderItem = Item & {
  content: StorageItem[];
  type: "folder";
};

export type StorageItem = FileItem | FolderItem;
