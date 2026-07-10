import { afterEach, describe, expect, it } from "vitest";
import { enforceRateLimit } from "@/src/security/rate-limit";
import { MemorySecurityStore } from "@/src/security/store";

describe("global rate limit contract", () => {
  afterEach(() => { delete process.env.RATE_LIMIT_REQUESTS; delete process.env.RATE_LIMIT_WINDOW_SECONDS; });
  it("rejects requests beyond the configured window limit", async () => {
    process.env.RATE_LIMIT_REQUESTS = "2"; process.env.RATE_LIMIT_WINDOW_SECONDS = "60";
    const store = new MemorySecurityStore();
    await enforceRateLimit(store, "actor"); await enforceRateLimit(store, "actor");
    await expect(enforceRateLimit(store, "actor")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
