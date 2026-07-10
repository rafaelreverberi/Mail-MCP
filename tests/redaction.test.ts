import { describe, expect, it } from "vitest";
import { redact } from "@/src/security/redaction";

describe("redaction", () => {
  it("redacts sensitive fields and known secret values", () => {
    expect(redact({ password: "hunter2", nested: { note: "token hunter2", authorization: "Bearer abc" } }, ["hunter2"]))
      .toEqual({ password: "[REDACTED]", nested: { note: "token [REDACTED]", authorization: "[REDACTED]" } });
  });
});
