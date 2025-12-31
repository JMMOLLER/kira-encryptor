import type { FileItem, FolderItem } from "@akira-encryptor/core/types";
import Encryptor, { FileSystem } from "@akira-encryptor/core";
import * as utils from "@akira-encryptor/core/utils";
import { workerPath } from "./const/workerPath";
import prompts from "prompts";
import fs from "fs";

interface HidePromptOptions {
  actionFor: CliActionFor;
  Encryptor: Encryptor;
  item: FileItem | FolderItem;
}

export async function askForHideItem(props: HidePromptOptions) {
  const { actionFor, Encryptor, item } = props;
  const { hide } = (await prompts([
    {
      type: "confirm",
      name: "hide",
      message: `¿Desea ocultar ${
        actionFor === "file" ? "el archivo" : "la carpeta"
      }`,
      initial: false,
    },
  ])) as { hide: boolean };
  if (hide) {
    await Encryptor.hideStoredItem(item._id);
  }
}

export async function askForOtherOperation() {
  process.stdout.write("\n");
  const { exit } = (await prompts([
    {
      type: "confirm",
      name: "exit",
      message: "¿Desea realizar otra operación?",
      initial: false,
    },
  ])) as { exit: boolean };
  return !exit;
}

// Note: If you enter an incorrect password, you will have to restart the program
let password: Buffer | undefined = undefined;

export async function askUserActions() {
  const { action } = (await prompts([
    {
      type: "select",
      name: "action",
      message: "¿Qué desea realizar?",
      choices: [
        { title: "Encriptar", value: "encrypt" },
        { title: "Desencriptar", value: "decrypt" },
      ],
    },
  ])) as { action?: CliAction };

  if (!action) {
    throw new Error("Acción no válida.");
  }

  const { type } = (await prompts([
    {
      type: "select",
      name: "type",
      message: `¿Qué desea ${
        action === "encrypt" ? "encriptar" : "desencriptar"
      }?`,
      choices: [
        { title: "Carpeta", value: "folder" },
        { title: "Archivo", value: "file" },
      ],
    },
  ])) as { type?: CliActionFor };

  if (!type) {
    throw new Error("Tipo no válido.");
  }

  let path: string = "";

  if (password && action === "decrypt") {
    const encryptor = await Encryptor.init(password, workerPath, {
      minDelayPerStep: 0,
      silent: true,
    });
    const storage = await encryptor.getStorage();
    const values = Array.from(storage.values());
    const choices = values
      .filter((item) => item.type === type)
      .map((item) => {
        const named = item.isHidden ? "." + item._id : item._id;
        return {
          title: item.path + (item.isHidden ? " (*)" : ""),
          value: item.path.replace(
            item.originalName!,
            item.type === "folder" ? named : named + ".enc"
          ),
        };
      });

    if (choices.length > 0) {
      // I think this last choice is not needed, but I will leave it here for now 🤔
      choices.push({ value: "Otra ruta...", title: "Otra ruta..." });

      // Prompt the user to select a path
      let { selectedPath } = (await prompts([
        {
          type: "select",
          name: "selectedPath",
          message: `Seleccione el elemento que desea desencriptar:`,
          choices,
        },
      ])) as { selectedPath?: string };

      if (!selectedPath) {
        throw new Error("Ruta no válida.");
      }

      path = selectedPath;
    }
  }

  if (!path || path === "Otra ruta...") {
    let { digitedPath } = (await prompts([
      {
        type: "text",
        name: "digitedPath",
        message: `Ruta de ${
          type === "folder" ? "la carpeta" : "el archivo"
        } a ${action === "encrypt" ? "encriptar" : "desencriptar"}:`,
        format: utils.normalizePath,
        validate: (v) => {
          const input = utils.normalizePath(v);

          if (!fs.existsSync(input)) {
            return "La ruta especificada no existe.";
          }
          if (type === "folder" && !fs.statSync(input).isDirectory()) {
            return "La ruta especificada no es una carpeta.";
          }
          if (type === "file" && !fs.statSync(input).isFile()) {
            return "La ruta especificada no es un archivo.";
          }
          return true;
        },
      },
    ])) as { digitedPath?: string };

    if (!digitedPath) {
      throw new Error("Ruta no válida.");
    }

    path = digitedPath;
  }

  if (!password) {
    const storeExists = FileSystem.getInstance().itemExists("./library.json");
    const { password: pwd } = (await prompts([
      {
        type: "password",
        name: "password",
        message: `${
          action === "encrypt" && !storeExists ? "Cree una" : "Ingrese la"
        } contraseña:`,
        mask: "*",
        validate: (input) => {
          if (input.length < 4) {
            return "La contraseña debe tener al menos 4 caracteres.";
          }
          return true;
        },
      },
    ])) as { password?: string };

    if (!pwd) {
      throw new Error("Contraseña no válida.");
    }

    password = Buffer.from(pwd);
  }

  return { action, type, path, password };
}
