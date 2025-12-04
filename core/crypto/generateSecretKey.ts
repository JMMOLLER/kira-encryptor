import { createHash } from "crypto";

export default function generateSecretKey(passphrase: Buffer): Buffer {
  const hash = createHash("sha256").update(passphrase).digest(); // SHA-256 da 32 bytes
  return Buffer.from(hash);
}
