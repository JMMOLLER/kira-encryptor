import type { Types } from "../types";

import generateSalt from "../crypto/generateSalt";
import { decode, encode } from "@msgpack/msgpack";
import generateUID from "../utils/generateUID";
import * as CRYPTO from "../crypto/constants";
import { FileSystem } from "./FileSystem";
import { env } from "../configs/env";
import Nedb from "@seald-io/nedb";

type BasicStorageItem = Omit<Types.FileItem | Types.FolderItem, "_id">;
type BasicFileItem = Omit<Types.FileItem, "_id">;
type BasicFolderItem = Omit<Types.FolderItem, "_id">;

class Storage {
  private static db: Omit<Nedb<Types.StorageItem>, "autoloadPromise">;
  private static readonly fs = FileSystem.getInstance();
  private storageHeader: Types.StorageHeader;
  private readonly dbPath: string;

  /**
   * @description `[ENG]` Promise that resolves when the storage is ready to be used.
   * @description `[ESP]` Promesa que se resuelve cuando el almacenamiento está listo para ser usado.
   */
  public readonly ready: Promise<void>;
  private _rejectReady!: (error: unknown) => void;
  private _resolveReady!: () => void;

  /**
   * @description `[ENG]` Initializes the storage with the given encryption and decryption functions to encrypt and decrypt the data.
   * @description `[ESP]` Inicializa el almacenamiento con las funciones de cifrado y descifrado dadas para descifrar y cifrar los datos.
   * @param dbPath - The path to the database file. Defaults to the value of `env.LIBRARY_PATH`.
   */
  constructor(dbPath = env.DB_PATH) {
    this.dbPath = dbPath;
    this.ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });

    // Initialize storage header with default values
    this.storageHeader = {
      kdf: CRYPTO.DEFAULT_KDF,
      memlimit: CRYPTO.DEFAULT_MEMLIMIT,
      opslimit: CRYPTO.DEFAULT_OPSLIMIT,
      salt: Buffer.from(generateSalt()).toString("hex"),
      verifier: "",
    };

    Storage.db = new Nedb<Types.StorageItem>({
      autoload: true,
      inMemoryOnly: true,
      onload: this.loadFromFile.bind(this),
    });
  }

  /**
   * @description `[ENG]` Loads the database from the file and populates the in-memory database.
   * @description `[ESP]` Carga la base de datos desde el archivo y llena la base de datos en memoria.
   */
  private async loadFromFile() {
    try {
      // Read the database file and parse its contents.
      const data = this.getStorageContent();

      // If an error occurred while reading the file, throw the error.
      if (data instanceof Error) {
        throw data;
      } else if (!data) {
        // If the file is empty, resolve immediately.
        this._resolveReady();
        return;
      }

      // Set the storage header
      this.storageHeader = data.header;

      // Insert each document into the database.
      for (const item of Object.values(data.body)) {
        await Storage.db.insertAsync(item);
      }
      this._resolveReady();
    } catch (error) {
      this._rejectReady(error); // Reject the ready promise if an error occurs.
    }
  }

  /**
   * @description `[ENG]` Retrieves and parses the storage content from the database file.
   * @description `[ESP]` Recupera y analiza el contenido del almacenamiento desde el archivo de la base de datos.
   */
  public getStorageContent(): Types.StorageData | Error {
    try {
      // If the database file does not exist, return an empty storage structure.
      if (!Storage.fs.itemExists(this.dbPath)) {
        return {
          header: this.storageHeader,
          body: {},
        };
      }

      // Read the database file and parse its contents.
      const data = Storage.fs.readFile(this.dbPath);

      // If the file is empty, throw an error.
      if (!data || data.length === 0) {
        throw new Error("Storage file is empty.");
      }

      const parsed = decode(data) as Types.StorageData; // using msgpack

      // Validate parsed data
      if (!parsed) throw new Error("Failed to parse storage data.");
      if (!parsed.header || !parsed.body) {
        throw new Error("Invalid storage data format.");
      }
      if (!parsed.header.verifier) {
        throw new Error(
          "Storage verifier missing. Maybe the storage is corrupted."
        );
      }

      return parsed;
    } catch (error) {
      return error as Error;
    }
  }

  /**
   * @description `[ENG]` Saves the current state of the database to the file.
   * @description `[ESP]` Guarda el estado actual de la base de datos en el archivo.
   */
  private async saveAsFile() {
    try {
      const body = Object.fromEntries(await this.getAll()); // Obtain all items from the database
      const data = {
        header: this.storageHeader,
        body,
      };

      if (!data.header.verifier) {
        throw new Error(
          "Storage verifier missing. Cannot save storage without a verifier."
        );
      }

      const buffer = Buffer.from(encode(data)); // Encode the data using msgpack
      await Storage.fs.createFile(this.dbPath, buffer); // Save the encoded buffer to the database file
    } catch (error) {
      return Promise.reject(error as Error);
    }
  }

  get db() {
    return Storage.db;
  }

  updateVerifier(verifier: string) {
    if (!!this.storageHeader.verifier) {
      throw new Error("Verifier already exists and cannot be updated.");
    }
    this.storageHeader.verifier = verifier;
  }

  async getAll() {
    await (Storage.db as Nedb<Types.StorageItem>).autoloadPromise;
    const all = Storage.db.getAllData();
    const map = all.reduce((acc, item) => {
      acc.set(item._id, item);
      return acc;
    }, new Map<string, Types.StorageItem>());

    return map;
  }

  async get(id: string): Promise<Types.StorageItem | null> {
    return await Storage.db.findOneAsync({ _id: id }).execAsync();
  }

  /**
   * @description `[ENG]` Store an item in the storage. If the item has an `id`, it will be replaced.
   * @description `[ESP]` Almacena un elemento en el almacenamiento. Si el elemento tiene un `id`, será reemplazado.
   * @param item `Omit<StorageItem, "id">` - The item to be stored. It should not contain the `id` property.
   */
  async set(item: BasicFileItem): Promise<Types.FileItem>;
  async set(item: BasicFolderItem): Promise<Types.FolderItem>;
  async set(item: BasicStorageItem) {
    const newId = generateUID();
    const newItem = {
      ...item,
      isHidden: !!item.isHidden,
      _id: newId,
    } as Types.StorageItem;

    const doc = await Storage.db.insertAsync(newItem);

    await this.saveAsFile();
    return doc;
  }

  async delete(id: string) {
    const item = await this.get(id);
    await Storage.db.removeAsync({ _id: id }, { multi: false });
    await this.saveAsFile();
    return item;
  }

  async update(id: string, item: BasicStorageItem) {
    await Storage.db.updateAsync({ _id: id }, item, {
      multi: false,
      upsert: false,
    });
    await this.saveAsFile();
    return await this.get(id);
  }
}

export default Storage;
