import { describe, expect, it } from "vitest";
import { truncateText } from "@/src/security/limits";
import { confirmActionInputSchema, markEmailInputSchema, prepareSendEmailInputSchema, readEmailsInputSchema, searchEmailsInputSchema } from "@/src/mcp/tools/schemas";

describe("input and resource limits", () => {
  it("truncates by Unicode characters", () => { expect(truncateText("A🙂BC", 3)).toEqual({ text: "A🙂B", truncated: true }); });
  it("rejects excessive search and invalid dates", () => {
    expect(searchEmailsInputSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(searchEmailsInputSchema.safeParse({ since: "2026-02-30" }).success).toBe(false);
    expect(searchEmailsInputSchema.safeParse({ since: "2026-07-10", before: "2026-07-01" }).success).toBe(false);
  });
  it("rejects invalid UID lists", () => {
    expect(readEmailsInputSchema.safeParse({ uids: [] }).success).toBe(false);
    expect(readEmailsInputSchema.safeParse({ uids: [0] }).success).toBe(false);
    expect(readEmailsInputSchema.safeParse({ uids: [1, 1] }).success).toBe(false);
    expect(readEmailsInputSchema.safeParse({ uids: Array.from({ length: 11 }, (_, index) => index + 1) }).success).toBe(false);
  });
  it("requires an explicit mark operation", () => { expect(markEmailInputSchema.safeParse({ uids: [1] }).success).toBe(false); });
  it("blocks header injection, duplicate recipients and mass recipients", () => {
    expect(prepareSendEmailInputSchema.safeParse({ to: ["a@example.com"], cc: [], bcc: [], subject: "Hello\r\nBcc: evil@example.com", text: "Body" }).success).toBe(false);
    expect(prepareSendEmailInputSchema.safeParse({ to: ["a@example.com"], cc: ["A@example.com"], bcc: [], subject: "Hi", text: "Body" }).success).toBe(false);
    expect(prepareSendEmailInputSchema.safeParse({ to: Array.from({ length: 101 }, (_, i) => `u${i}@example.com`), cc: [], bcc: [], subject: "Hi", text: "Body" }).success).toBe(false);
  });
  it("accepts only bounded token syntax", () => {
    expect(confirmActionInputSchema.safeParse({ confirmationToken: "not-a-token" }).success).toBe(false);
    expect(confirmActionInputSchema.safeParse({ confirmationToken: `${"a".repeat(30)}.${"b".repeat(30)}` }).success).toBe(true);
  });
});
