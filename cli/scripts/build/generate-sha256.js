import { createHash } from "crypto";
import { join } from "path";
import fs from "fs";

const distDir = join("dist");
const outputFile = join(distDir, "sha256sum.txt");

const { version } = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

const file = `kira-encryptor-cli-v${version}.exe`;

async function calculateSHA256(archivoRuta) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(archivoRuta);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

(async () => {
  const results = [];

  const fullPath = join(distDir, file);

  try {
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }

    const hash = await calculateSHA256(fullPath);
    results.push(`${hash}\t${file}`);
  } catch (err) {
    console.error(`⚠️ Error while processing "${file}":`, err);
  }

  fs.writeFileSync(outputFile, results.join("\n"), "utf-8");
  console.log("✅ File sha256sum.txt generated successfully.");
})();
