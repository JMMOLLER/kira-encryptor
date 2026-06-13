import type { BufferEncoding } from "../types/public";
import { exit } from "process";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  ENCODING: z
    .custom<BufferEncoding>(
      (val) => {
        if (typeof val !== "string") return false;
        return Buffer.isEncoding(val);
      },
      { message: "Invalid value encoding" }
    )
    .default("base64"),
  DB_PATH: z.string().default("./storage.bin"),
  LOG: z
    .string()
    .transform((val) => val === "true")
    .default("false"),
  PASSWORD: z
    .string()
    .min(4, "Password must be at least 4 characters")
    .optional(),
  MAX_THREADS: z
    .string()
    .transform((val) => Number(val))
    .pipe(z.number().int().positive().min(1))
    .default("1")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.format());
  exit(1);
}

export const env = parsed.data;
