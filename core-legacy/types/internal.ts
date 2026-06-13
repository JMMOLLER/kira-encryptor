import { createWriteStream, createReadStream } from "fs";
import type * as Type from "./public";

type InternalFlow = Pick<Type.StreamHandlerProps, "isInternalFlow">;

export type FileEncryptor = Type.FileEncryptor & InternalFlow;

export type FileDecryptor = Type.FileDecryptor &
  InternalFlow & { fileItem?: Type.FileItem };

export type FolderEncryptor = Type.FolderEncryptor &
  InternalFlow & { folderItem?: Type.FolderItem; tempPath?: string };

export type FolderDecryptor = Type.FolderDecryptor &
  InternalFlow & { folderItem?: Type.FolderItem };

export type WriteStreamOptions = Parameters<typeof createWriteStream>[1];

export type ReadStreamOptions = Parameters<typeof createReadStream>[1];
