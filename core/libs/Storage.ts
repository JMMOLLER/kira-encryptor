import encryptText from "../crypto/encryptText";
import decryptText from "../crypto/decryptText";
import generateUID from "../utils/generateUID";
import type { Types } from "../types";
import { env } from "../configs/env";
import Nedb from "@seald-io/nedb";

type BasicStorageItem = Omit<Types.FileItem | Types.FolderItem, "_id">;
type BasicFileItem = Omit<Types.FileItem, "_id">;
type BasicFolderItem = Omit<Types.FolderItem, "_id">;

class Storage {
  private static db: Nedb<Types.StorageItem>;

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
    dbPath = env.LIBRARY_PATH
  ) {
    Storage.db = new Nedb<Types.StorageItem>({
      filename: dbPath,
      autoload: true,
      beforeDeserialization: (line) => {
        const foo = decryptText(line, secretKey, encoding);
        return foo;
      },
      afterSerialization: async (line) => {
        const foo = await encryptText(line, secretKey, encoding);
        return foo;
      }
    });
    Storage.db.compactDatafile(); // Compact the data file when the database is loaded
  }

  get db() {
    return Storage.db;
  }

  async getAll() {
    await Storage.db.autoloadPromise;
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
      _id: newId
    } as Types.StorageItem;

    return await new Promise((resolve, reject) => {
      Storage.db.insert(newItem, (err, doc) => {
        if (err) {
          console.error("Error inserting item:", err);
          reject(err);
        } else {
          resolve(doc);
        }
      });
    });
  }

  async delete(id: string) {
    const item = await this.get(id);
    await Storage.db.removeAsync({ _id: id }, { multi: false });
    return item;
  }

  async update(id: string, item: BasicStorageItem) {
    await Storage.db.updateAsync({ _id: id }, item, {
      multi: false,
      upsert: false
    });
    return await this.get(id);
  }
}

export default Storage;
