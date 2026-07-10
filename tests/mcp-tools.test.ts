import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@/src/mcp/create-server";
import type { AuditLogger } from "@/src/logging/logger";
import { ConfirmationService } from "@/src/security/confirmation";
import { MemorySecurityStore } from "@/src/security/store";
import { FakeMailService } from "@/tests/fakes/fake-mail-service";

const silentLogger: AuditLogger = { write() {} };

describe("MCP tool contracts", () => {
  let client: Client; let close: () => Promise<void>; let fake: FakeMailService;
  beforeEach(async () => {
    process.env.AUTH_MODE = "local"; process.env.WRITE_ACTIONS_ENABLED = "true"; process.env.CONFIRMATION_SIGNING_SECRET = "z".repeat(48);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    fake = new FakeMailService();
    const server = createMcpServer(fake, silentLogger, new ConfirmationService(new MemorySecurityStore(), fake));
    client = new Client({ name: "test-client", version: "1.0.0" });
    await server.connect(serverTransport); await client.connect(clientTransport);
    close = async () => { await client.close(); await server.close(); };
  });
  afterEach(async () => { await close(); delete process.env.AUTH_MODE; delete process.env.WRITE_ACTIONS_ENABLED; delete process.env.CONFIRMATION_SIGNING_SECRET; });

  it("advertises all twelve tools with accurate annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "confirm_delete_email", "confirm_send_email", "create_draft", "create_mailbox", "health_check", "list_mailboxes",
      "mark_email", "move_email", "prepare_delete_email", "prepare_send_email", "read_emails", "search_emails",
    ]);
    expect(tools.find((tool) => tool.name === "read_emails")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tools.find((tool) => tool.name === "confirm_send_email")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  });

  it("publishes bounded input and output schemas", async () => {
    const { tools } = await client.listTools();
    const read = tools.find((tool) => tool.name === "read_emails"); const send = tools.find((tool) => tool.name === "prepare_send_email");
    expect(read?.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(read?.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(read?.inputSchema)).toContain('"maxItems":10');
    expect(JSON.stringify(send?.inputSchema)).toContain('"format":"email"');
  });

  it("executes a full prepare/confirm send flow", async () => {
    const prepared = await client.callTool({ name: "prepare_send_email", arguments: { to: ["a@example.com"], cc: [], bcc: [], subject: "Hello", text: "Body" } });
    expect(prepared.isError).not.toBe(true);
    const token = (prepared.structuredContent as { confirmationToken: string }).confirmationToken;
    const sent = await client.callTool({ name: "confirm_send_email", arguments: { confirmationToken: token } });
    expect(sent.structuredContent).toMatchObject({ success: true }); expect(fake.sendCount).toBe(1);
  });
});
