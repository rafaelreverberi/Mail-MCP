import { afterEach, describe, expect, it } from "vitest";
import { requireScope } from "@/src/security/auth";

describe("scope authorization", () => {
  afterEach(() => { delete process.env.AUTH_MODE; });

  it("allows the synthetic principal only in local mode", () => {
    process.env.AUTH_MODE = "local";
    expect(requireScope(undefined, "mail.read")).toBe("local-user");
  });

  it("rejects missing or insufficient OAuth authorization", () => {
    process.env.AUTH_MODE = "oauth";
    expect(() => requireScope(undefined, "mail.read")).toThrow();
    expect(() => requireScope({ token: "redacted", clientId: "client", scopes: ["mail.search"], extra: { userId: "user-1" } }, "mail.read"))
      .toThrowError(expect.objectContaining({ code: "FORBIDDEN" }));
  });
});
