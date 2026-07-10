import { describe, expect, it } from "vitest";
import { SafeError, publicError } from "@/src/errors/safe-error";
import { errorResult } from "@/src/mcp/result";

describe("safe errors", () => {
  it("preserves approved codes", () => { expect(publicError(new SafeError("FORBIDDEN", "Missing scope."))).toEqual({ code: "FORBIDDEN", message: "Missing scope." }); });
  it("does not expose unexpected details", () => {
    const result = errorResult(new Error("password=hunter2 full IMAP response"));
    expect(JSON.stringify(result)).toContain("INTERNAL_ERROR"); expect(JSON.stringify(result)).not.toMatch(/hunter2|IMAP response/u);
  });
});
