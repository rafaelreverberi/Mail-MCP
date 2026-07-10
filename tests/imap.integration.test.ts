import { describe, expect, it } from "vitest";
import { ImapMailService } from "@/src/mail/mail-service";

describe.skipIf(process.env.RUN_IMAP_INTEGRATION_TESTS !== "true")("IMAP integration", () => {
  it("connects without loading email content", async () => { await expect(new ImapMailService().checkConnection()).resolves.toBe(true); });
});
