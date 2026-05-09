import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

let cachedKey: string | undefined;

export function getOpenAIKey(userProvidedKey?: unknown) {
  if (typeof userProvidedKey === "string" && userProvidedKey.trim()) {
    return userProvidedKey.trim();
  }

  cachedKey ??= readLocalEnvKey() ?? process.env.OPENAI_API_KEY ?? "";
  return cachedKey;
}

function readLocalEnvKey() {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const env = readFileSync(envPath, "utf8");
    const line = env.split(/\r?\n/).find((entry) => entry.startsWith("OPENAI_API_KEY="));
    return line?.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}
