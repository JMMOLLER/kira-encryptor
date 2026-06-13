import path from "path";

let thisExt: string | undefined;
if (typeof import.meta !== "undefined" && import.meta.url) {
  thisExt = path.extname(import.meta.url);
} else if (typeof __filename !== "undefined") {
  thisExt = path.extname(__filename);
} else {
  thisExt = undefined;
}

let encryptorWorkerPath: string | undefined;

if (typeof import.meta !== "undefined" && import.meta.dirname) {
  encryptorWorkerPath = path.resolve(
    import.meta.dirname,
    `./encryptor.worker${thisExt}`
  );
} else if (typeof __dirname !== "undefined") {
  encryptorWorkerPath = path.resolve(__dirname, `./encryptor.worker${thisExt}`);
} else {
  encryptorWorkerPath = undefined;
}

export { encryptorWorkerPath };
