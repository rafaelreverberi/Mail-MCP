import { describe, expect, it } from "vitest";
import { MemorySecurityStore } from "@/src/security/store";

describe("security store", () => {
  it("stores only once and atomically consumes once", async () => {
    const store = new MemorySecurityStore();
    await expect(store.putOnce("key", "value", 60)).resolves.toBe(true);
    await expect(store.putOnce("key", "other", 60)).resolves.toBe(false);
    await expect(store.consume("key")).resolves.toBe("value");
    await expect(store.consume("key")).resolves.toBeNull();
  });
  it("increments within a window", async () => {
    const store = new MemorySecurityStore();
    await expect(store.incrementWithinWindow("rate", 60)).resolves.toBe(1);
    await expect(store.incrementWithinWindow("rate", 60)).resolves.toBe(2);
  });
});
