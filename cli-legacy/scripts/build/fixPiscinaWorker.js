import { rename, access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import path from "node:path";

const outputDir = path.resolve("./dist");
const inputFile = path.resolve("node_modules/piscina/dist/worker.js");
const outputFile = path.join(outputDir, "worker.js");
const renamedFile = path.join(outputDir, "worker.cjs");
const mainCjsFile = path.join(outputDir, "main.cjs");

console.log("📦 Compilando worker de Piscina con bun...");

const buildProcess = spawn(
  "bun",
  [
    "build",
    inputFile,
    "--target",
    "node",
    "--format",
    "cjs",
    "--outdir",
    outputDir
  ],
  {
    stdio: "inherit",
    shell: true
  }
);

buildProcess.on("close", async (code) => {
  if (code !== 0) {
    console.error(`❌ Error: bun build terminó con código ${code}`);
    process.exit(code);
  }

  try {
    await access(outputFile, constants.F_OK);
    await rename(outputFile, renamedFile);
    console.log(`✅ worker.js renombrado a worker.cjs en ${outputDir}`);

    // Reemplazar texto ruta stub de piscina en main.cjs
    const mainCode = await readFile(mainCjsFile, "utf8");
    const updatedMainCode = mainCode.replace(
      // Regex para encontrar la línea que importa el worker.js
      /\(0,EB\.resolve\)\(__dirname,\s*["']worker\.js["']\)/g,
      // Reemplazar por require.resolve parchado por pkg
      'require.resolve("./worker.cjs")'
    );

    if (mainCode !== updatedMainCode) {
      await writeFile(mainCjsFile, updatedMainCode, "utf8");
      console.log("🔁 Reemplazo en main.cjs el stub: worker.js → worker.cjs");
    } else {
      console.warn(
        "⚠️ No se encontró la cadena del stub a reemplazar en main.cjs"
      );
    }

    // Reemplazar texto ruta worker en main.cjs
    const workerPathWithCJS = updatedMainCode.replace(
      /"core\/workers\/encryptor\.worker\.ts"/g,
      '"core/workers/encryptor.worker.cjs"'
    );

    if (updatedMainCode !== workerPathWithCJS) {
      await writeFile(mainCjsFile, workerPathWithCJS, "utf8");
      console.log(
        "🔁 Reemplazo de ruta del worker en main.cjs: worker.ts → worker.cjs"
      );
    } else {
      console.warn(
        "⚠️ No se encontró la cadena del worker a reemplazar en main.cjs"
      );
    }
  } catch (err) {
    console.error("❌ Error al renombrar worker.js:", err.message);
    process.exit(1);
  }
});
