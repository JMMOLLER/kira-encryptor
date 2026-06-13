import { FileSystem } from "../libs/FileSystem";

export default function collectFileSizes(dirPath: string): number {
  let totalSize = 0;
  const STORAGE = FileSystem.getInstance();
  const entries = STORAGE.readDir(dirPath);

  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry.name}`;
    if (entry.isFile()) {
      totalSize += STORAGE.getStatFile(fullPath).size;
    } else if (entry.isDirectory()) {
      totalSize += collectFileSizes(fullPath);
    }
  }

  return totalSize;
}
