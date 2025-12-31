import sodium from "sodium-native";

export default function generateSalt(): Buffer {
  const salt = Buffer.alloc(sodium.crypto_pwhash_SALTBYTES);
  sodium.randombytes_buf(salt);
  return salt;
}
