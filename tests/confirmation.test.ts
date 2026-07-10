import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfirmationService } from "@/src/security/confirmation";
import { MemorySecurityStore, type SecurityStore } from "@/src/security/store";
import { FakeMailService } from "@/tests/fakes/fake-mail-service";

const original = { write: process.env.WRITE_ACTIONS_ENABLED, secret: process.env.CONFIRMATION_SIGNING_SECRET };

describe("two-step confirmation", () => {
  beforeEach(() => { process.env.WRITE_ACTIONS_ENABLED = "true"; process.env.CONFIRMATION_SIGNING_SECRET = "s".repeat(48); });
  afterEach(() => {
    if (original.write === undefined) delete process.env.WRITE_ACTIONS_ENABLED; else process.env.WRITE_ACTIONS_ENABLED = original.write;
    if (original.secret === undefined) delete process.env.CONFIRMATION_SIGNING_SECRET; else process.env.CONFIRMATION_SIGNING_SECRET = original.secret;
  });

  it("sends exactly once after confirmation", async () => {
    const fake = new FakeMailService(); const service = new ConfirmationService(new MemorySecurityStore(), fake);
    const prepared = await service.prepareSend("user-1", { to: ["a@example.com"], cc: [], bcc: [], subject: "Hello", text: "Body" });
    await expect(service.confirmSend("user-1", prepared.confirmationToken)).resolves.toMatchObject({ success: true });
    await expect(service.confirmSend("user-1", prepared.confirmationToken)).rejects.toMatchObject({ code: "CONFIRMATION_REPLAYED" });
    expect(fake.sendCount).toBe(1);
  });

  it("binds the token to the user and detects tampering", async () => {
    const service = new ConfirmationService(new MemorySecurityStore(), new FakeMailService());
    const prepared = await service.prepareDelete("user-1", { mailbox: "INBOX", uids: [42] });
    await expect(service.confirmDelete("user-2", prepared.confirmationToken)).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
    await expect(service.confirmDelete("user-1", `${prepared.confirmationToken.slice(0, -1)}x`)).rejects.toMatchObject({ code: "CONFIRMATION_INVALID" });
  });

  it("moves to Trash exactly once after delete confirmation", async () => {
    const fake = new FakeMailService(); const service = new ConfirmationService(new MemorySecurityStore(), fake);
    const prepared = await service.prepareDelete("user-1", { mailbox: "INBOX", uids: [7, 9] });
    await service.confirmDelete("user-1", prepared.confirmationToken);
    expect(fake.lastDeleted).toEqual({ mailbox: "INBOX", uids: [7, 9] }); expect(fake.deleteCount).toBe(1);
  });

  it("does not store the prepared mail body as plaintext", async () => {
    let storedValue = "";
    const backing = new MemorySecurityStore();
    const store: SecurityStore = {
      async putOnce(key, value, ttl) { storedValue = value; return backing.putOnce(key, value, ttl); },
      consume: (key) => backing.consume(key),
      incrementWithinWindow: (key, ttl) => backing.incrementWithinWindow(key, ttl),
      appendAudit: (event) => backing.appendAudit(event),
    };
    const service = new ConfirmationService(store, new FakeMailService());
    await service.prepareSend("user-1", { to: ["a@example.com"], cc: [], bcc: [], subject: "Secret subject", text: "Highly private body" });
    expect(storedValue).not.toMatch(/Highly private body|Secret subject|a@example\.com/u);
  });

  it("keeps writes disabled without explicit configuration", async () => {
    process.env.WRITE_ACTIONS_ENABLED = "false";
    const service = new ConfirmationService(new MemorySecurityStore(), new FakeMailService());
    await expect(service.prepareDelete("user-1", { mailbox: "INBOX", uids: [1] })).rejects.toMatchObject({ code: "WRITES_DISABLED" });
  });
});
