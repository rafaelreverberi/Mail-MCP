import { beforeEach, describe, expect, it } from "vitest";
import { FakeMailService } from "@/tests/fakes/fake-mail-service";
import { readEmails } from "@/src/mcp/tools/read-emails";
import { searchEmails } from "@/src/mcp/tools/search-emails";

describe("mail service dependency injection", () => {
  beforeEach(() => {
    process.env.MAX_EMAIL_BODY_CHARACTERS = "30000";
    process.env.MAX_SEARCH_RESULTS = "20";
  });

  it("passes bounded search input to the injected service", async () => {
    const fake = new FakeMailService();
    const result = await searchEmails(fake, { mailbox: "INBOX", subject: "invoice" });
    expect(result.emails).toHaveLength(1);
    expect(fake.lastSearch).toMatchObject({ mailbox: "INBOX", subject: "invoice", limit: 20 });
  });

  it("passes UIDs and the configured body limit", async () => {
    const fake = new FakeMailService();
    const result = await readEmails(fake, { mailbox: "INBOX", uids: [2, 7] });
    expect(result.emails).toHaveLength(2);
    expect(fake.lastRead).toEqual({ mailbox: "INBOX", uids: [2, 7], maximum: 30_000 });
    expect(result.emails[0]?.contentTrust).toBe("untrusted_email_content");
  });
});
