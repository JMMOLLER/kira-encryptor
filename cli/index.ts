import { askForOtherOperation, askUserActions } from "./prompts";
import handleFolderAction from "./handlers/folderHandler";
import handleFileAction from "./handlers/fileHandler";
import fs from "fs";

async function main() {
  let exit = false;
  do {
    const { action, type, path, credential } = await askUserActions();

    if (
      (type === "file" &&
        (!fs.existsSync(path) || !fs.statSync(path).isFile())) ||
      (type === "folder" &&
        (!fs.existsSync(path) || !fs.statSync(path).isDirectory()))
    ) {
      console.error("\n❌ La ruta especificada no es válida.");
      if (!(await askForOtherOperation())) continue;
      process.exit(1);
    }

    try {
      if (type === "file") {
        await handleFileAction({ action, filePath: path, credential });
      } else {
        await handleFolderAction({ action, folderPath: path, credential });
      }
      exit = await askForOtherOperation();
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  } while (!exit);
}

main();
