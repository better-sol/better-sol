import { createServerFn } from "@tanstack/react-start";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const CHARSET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = 62;
const LIMIT = 248;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return Buffer.from(process.env.ENCRYPTION_KEY, "hex");
}

export const generateToken = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      prefix: z.string().min(1).max(8).default("bsk"),
      length: z.number().int().min(16).max(64).default(KEY_BYTES),
    }),
  )
  .handler(async ({ data: { prefix, length } }) => {
    const buf = new Uint8Array(length + 8);
    crypto.getRandomValues(buf);
    let token = `${prefix}_`;
    let i = 0;
    for (let pos = 0; pos < length; pos++) {
      while (buf[i] >= LIMIT) i++;
      token += CHARSET[buf[i++] % BASE];
    }
    return token;
  });

export const encryptValue = createServerFn({ method: "POST" })
  .inputValidator(z.object({ value: z.string() }))
  .handler(async ({ data: { value } }) => {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, encrypted]);
    return { encrypted: combined.toString("base64") };
  });

export const decryptValue = createServerFn({ method: "POST" })
  .inputValidator(z.object({ encrypted: z.string() }))
  .handler(async ({ data: { encrypted } }) => {
    const key = getEncryptionKey();
    const combined = Buffer.from(encrypted, "base64");
    const iv = combined.subarray(0, IV_BYTES);
    const tag = combined.subarray(IV_BYTES, IV_BYTES + 16);
    const ciphertext = combined.subarray(IV_BYTES + 16);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  });
