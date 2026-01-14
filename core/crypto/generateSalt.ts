import { SALT_BYTES } from "./constants/node";
import sodium from "sodium-native";

/**
 * @description `[ENG]` Generates a cryptographic salt of length 16 bytes (128 bits) for key derivation.
 * @description `[ESP]` Genera una salt criptográfica de longitud 16 bytes (128bits) para la derivación de claves.
 * @returns A Buffer containing the generated salt.
 */
export default function generateSalt(): Buffer {
  const salt = Buffer.alloc(SALT_BYTES);
  sodium.randombytes_buf(salt);
  return salt;
}
