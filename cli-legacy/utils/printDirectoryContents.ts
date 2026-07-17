import path from "path";
import fs from "fs";

export function printDirectoryContents(dir: string) {
  console.log("isPkg:", process.pkg);
  const baseDir = process.pkg
    ? process.pkg.path.resolve(dir)
    : path.resolve(dir);

  if (!fs.existsSync(baseDir)) {
    console.log(`No existe el directorio: ${baseDir}`);
    return;
  } else {
    console.log(`Contenido del directorio: ${baseDir}`);
  }

  const items = fs.readdirSync(baseDir);
  items.forEach((item) => {
    const fullPath = path.join(baseDir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      console.log(`[DIR ] ${item}`);
    } else {
      console.log(`[FILE] ${item}`);
    }
  });
}
