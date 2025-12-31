import type { FileEncryptor, ProgressCallback } from "@akira-encryptor/core/types";
import * as utils from "@akira-encryptor/core/utils";
import EncryptorClass from "@akira-encryptor/core";
import { workerPath } from "../const/workerPath";
import { askForHideItem } from "../prompts";
import cliProgress from "cli-progress";
import path from "path";

type HanlderProps = {
  action: CliAction;
  filePath: string;
  password: Buffer;
};

const progressBar = new cliProgress.SingleBar(
  {
    format: "Progreso total |{bar}| {percentage}% || {processed}/{formattedTotal}"
  },
  cliProgress.Presets.shades_classic
);

async function handleFileAction(props: HanlderProps) {
  const { action, filePath, password } = props;

  let formattedTotal = "0B";
  let init = false;

  const handleProgress: ProgressCallback = (processed, total) => {
    if (!init) {
      formattedTotal = utils.formatBytes(total);
      progressBar.start(total, 0, {
        processed: utils.formatBytes(0),
        formattedTotal
      });
      init = true;
    }

    progressBar.update(processed, {
      processed: utils.formatBytes(processed),
      formattedTotal
    });

    if (processed >= total) {
      progressBar.stop();
    }
  };

  const handleEnd: FileEncryptor["onEnd"] = (error) => {
    // Fallback to stop the progress bar
    progressBar.stop();
    // Print the success or error message
    if (!error) {
      utils
        .createSpinner(
          `Archivo '${filePath}' ${
            action === "encrypt" ? "encriptado" : "desencriptado"
          } correctamente.`
        )
        .succeed();
    } else {
      utils
        .createSpinner(
          `Error al ${
            action === "encrypt" ? "encriptar" : "desencriptar"
          } el archivo '${filePath}'.`
        )
        .fail();
    }
  };

  try {
    // Ensure the bar is not running from a previous operation
    progressBar.stop();

    const Encryptor = await EncryptorClass.init(password, workerPath);

    if (action === "encrypt") {
      const item = await Encryptor.encryptFile({
        filePath: path.normalize(filePath),
        onProgress: handleProgress,
        onEnd: handleEnd
      });

      // Ask if the user wants to hide the file
      await askForHideItem({
        actionFor: "file",
        Encryptor,
        item
      });
    } else {
      // If the folder is hidden, we need to reveal it first
      const resolvedFilePath = await handleIsHiddenFile(filePath, Encryptor);

      await Encryptor.decryptFile({
        filePath: path.normalize(resolvedFilePath),
        onProgress: handleProgress,
        onEnd: handleEnd
      });
    }
  } catch (error) {
    progressBar.stop();
    console.error(`\n❌ Error al procesar el archivo:\n`, error);
    return;
  }
}

async function handleIsHiddenFile(filePath: string, Encryptor: EncryptorClass) {
  const storage = await Encryptor.getStorage();
  const id = path
    .basename(filePath)
    .replace(/^\./, "")
    .replace(/\.enc$/, "");
  const item = storage.get(id);

  if (item?.isHidden) {
    const status = await Encryptor.revealStoredItem(item._id);
    if (status) {
      return filePath.replace(path.basename(filePath), item._id + ".enc");
    }
  }

  return filePath;
}

export default handleFileAction;
