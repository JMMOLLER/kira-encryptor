import { nanoid } from "nanoid";

export default function generateUID(): string {
  return nanoid(12);
}
