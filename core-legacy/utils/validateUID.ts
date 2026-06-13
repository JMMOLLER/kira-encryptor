export default function validateUID(uid: string) {
  if (!uid || typeof uid !== "string") {
    throw new Error("Invalid UID: UID must be a non-empty string.");
  }
}
