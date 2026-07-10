import { parseEnvironment } from "@/src/config/env";
import { SafeError } from "@/src/errors/safe-error";
import type { SecurityStore } from "@/src/security/store";

export async function enforceRateLimit(store: SecurityStore, key: string): Promise<void> {
  const env = parseEnvironment();
  const count = await store.incrementWithinWindow(`mcp:rate:${key}`, env.RATE_LIMIT_WINDOW_SECONDS);
  if (count > env.RATE_LIMIT_REQUESTS) throw new SafeError("RATE_LIMITED", "Too many requests. Try again later.");
}
