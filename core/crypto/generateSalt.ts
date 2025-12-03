import sodium from 'libsodium-wrappers-sumo';

export default async function generateSalt() {
  await sodium.ready;
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}
