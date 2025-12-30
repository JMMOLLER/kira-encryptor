import type { Types } from "../types";

import { decode, encode } from "@msgpack/msgpack";
import generateUID from "../utils/generateUID";
import { FileSystem } from "./FileSystem";
import { env } from "../configs/env";
import Nedb from "@seald-io/nedb";

type BasicStorageItem = Omit<Types.FileItem | Types.FolderItem, "_id">;
type BasicFileItem = Omit<Types.FileItem, "_id">;
type BasicFolderItem = Omit<Types.FolderItem, "_id">;

class Storage {
  private static db: Omit<Nedb<Types.StorageItem>, "autoloadPromise">;
  private readonly fs: FileSystem;
  private readonly dbPath: string;

  private _rejectReady!: (error: unknown) => void;
  public readonly ready: Promise<void>;
  private _resolveReady!: () => void;

  /**
   * @description `[ENG]` Initializes the storage with the given encryption and decryption functions to encrypt and decrypt the data.
   * @description `[ESP]` Inicializa el almacenamiento con las funciones de cifrado y descifrado dadas para descifrar y cifrar los datos.
   * @param secretKey - The secret key used for encryption and decryption.
   * @param encoding - The encoding used for the data.
   * @param dbPath - The path to the database file. Defaults to the value of `env.LIBRARY_PATH`.
   */
  constructor(
    secretKey: Buffer,
    encoding: Types.BufferEncoding,
    dbPath = env.DB_PATH
  ) {
    this.dbPath = dbPath;
    this.fs = FileSystem.getInstance();
    this.ready = new Promise<void>((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
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
      // If the database file does not exist, resolve immediately.
      if (!this.fs.itemExists(this.dbPath)) {
        this._resolveReady();
        return;
      }

      // Read the database file and parse its contents.
      const data = this.fs.readFile(this.dbPath);

      // If the file is empty, resolve immediately.
      if (!data || data.length === 0) {
        this._resolveReady();
        return;
      }
      const parsed = decode(data) as Types.StorageItem; // using msgpack

      if (!parsed) throw new Error("Failed to parse storage data.");

      // Insert each document into the database.
      for (const doc of Object.values(parsed)) {
        await Storage.db.insertAsync(doc);
      }
      this._resolveReady();
    } catch (error) {
      this._rejectReady(error); // Reject the ready promise if an error occurs.
    }
  }

  /**
   * @description `[ENG]` Saves the current state of the database to the file.
   * @description `[ESP]` Guarda el estado actual de la base de datos en el archivo.
   */
  private async saveAsFile() {
    const data = Object.fromEntries(await this.getAll()); // Obtain all items from the database
    const buffer = Buffer.from(encode(data)); // Encode the data using msgpack
    this.fs.createFile(this.dbPath, buffer); // Save the encoded buffer to the database file
  }

  get db() {
    return Storage.db;
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
   * @deprecated
   */
  async refresh() {
    console.warn("[Core-Storage] This method is deprecated and does nothing.");
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
