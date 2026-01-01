import sodium from "sodium-native";

/**
 * @description `[ENG]` - Generates a verifier from the provided secret key.
 * @description `[ESP]` - Genera un verificador a partir de la clave secreta proporcionada.
 * @param secretKey `Buffer` - The derivated secret key.
 * @returns `Buffer` - The generated verifier.
 */
function generateVerifier(secretKey: Buffer): Buffer {
  // 32-byte verifier
  const verifier = Buffer.alloc(32);
  // Generate verifier using a hash of the secret key
  sodium.crypto_generichash(verifier, secretKey);
  return verifier;
}

/**
 * @description `[ENG]` - Checks if the provided secret key matches the stored verifier.
 * @description `[ESP]` - Verifica si la clave secreta proporcionada coincide con el verificador almacenado.
 * @param secretKey `Buffer` - The derivated secret key to verify.
 * @param storedVerifier `string` - The stored verifier in hexadecimal format.
 * @returns `boolean` - Returns true if the secret key is valid, false otherwise.
 */
function checkVerifier(secretKey: Buffer, storedVerifier: string): boolean {
  // Compare the generated verifier with the stored verifier
  const expected = Buffer.from(storedVerifier, "hex");
  const actual = Buffer.alloc(32); // 32-byte verifier

  // Generate verifier using a hash of the secret key
  sodium.crypto_generichash(actual, secretKey);

  // Use constant-time comparison to prevent timing attacks
  return sodium.sodium_memcmp(actual, expected);
}

export { generateVerifier, checkVerifier };
