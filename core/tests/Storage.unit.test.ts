import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import generateSecretKey from "../crypto/generateSecretKey";
import type { StorageItem } from "../types/public";
import Storage from "../libs/Storage";
import { env } from "../configs/env";
import path from "path";
import fs from "fs";

const storagePath = path.resolve(__dirname, "../test-storage.json");
const secretKey = generateSecretKey(Buffer.from("mypassword"));
const testItem: StorageItem = {
  encryptedName: "test.txt",
  originalName: "test.txt",
  encryptedAt: new Date(),
  path: "test.txt",
  isHidden: false,
  _id: "mock-uid",
  type: "file"
};

afterAll(() => {
  fs.rmSync(storagePath, {
    force: true
  });
});

describe("Storage", () => {
  let storage: Storage;

  beforeEach(async () => {
    storage = new Storage(
      secretKey,
      env.ENCODING,
      storagePath
    );
    vi.clearAllMocks();
  });

  it("should add an item to storage", async () => {
    const setSpy = vi.spyOn(storage, "set");
    const result = await storage.set(testItem);

    expect(setSpy).toHaveBeenCalledWith(testItem);
    expect(result).toHaveProperty("_id");
    expect(result._id).not.toBe(testItem._id);
  });

  it("should retrieve an item from storage", async () => {
    const { _id } = await storage.set(testItem);
    const getSpy = vi.spyOn(storage, "get");
    const result = await storage.get(_id);

    expect(getSpy).toHaveBeenCalledWith(_id);
    expect(result).toEqual({ ...testItem, _id });
  });

  it("should remove an item from storage", async () => {
    await storage.set(testItem);
    const removeSpy = vi.spyOn(storage, "delete");
    await storage.delete(testItem._id);

    const result = await storage.get(testItem._id);
    expect(removeSpy).toHaveBeenCalledWith(testItem._id);
    expect(result).toBeNull();
  });

  it("should handle non-existent items gracefully", async () => {
    const getSpy = vi.spyOn(storage, "get");
    const result = await storage.get("non-existent-id");

    expect(getSpy).toHaveBeenCalledWith("non-existent-id");
    expect(result).toBeNull();
  });

  it("should update an existing item in storage", async () => {
    await storage.set(testItem);
    const updatedItem = { ...testItem, encryptedName: "updated.txt" };
    const updateSpy = vi.spyOn(storage, "set");
    const { _id } = await storage.set(updatedItem);

    const result = await storage.get(_id);
    expect(updateSpy).toHaveBeenCalledWith(updatedItem);
    expect(result).toEqual({ ...updatedItem, _id });
  });
});
