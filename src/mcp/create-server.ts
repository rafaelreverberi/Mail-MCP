import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ImapMailService } from "@/src/mail/mail-service";
import type { MailService } from "@/src/mail/types";
import { consoleAuditLogger, type AuditLogger } from "@/src/logging/logger";
import { runLoggedTool } from "@/src/mcp/result";
import { healthCheck } from "@/src/mcp/tools/health-check";
import { listMailboxes } from "@/src/mcp/tools/list-mailboxes";
import { readEmails } from "@/src/mcp/tools/read-emails";
import { searchEmails } from "@/src/mcp/tools/search-emails";
import {
  confirmDeleteEmail, confirmSendEmail, createDraft, createMailbox, markEmail, moveEmail, prepareDeleteEmail, prepareSendEmail,
} from "@/src/mcp/tools/write-actions";
import {
  confirmActionInputSchema, confirmationOutputSchema, createDraftInputSchema, createMailboxInputSchema, createMailboxOutputSchema,
  draftOutputSchema, healthCheckInputSchema, healthCheckOutputSchema, listMailboxesInputSchema, listMailboxesOutputSchema,
  markEmailInputSchema, moveEmailInputSchema, moveOutputSchema, mutationOutputSchema, prepareDeleteEmailInputSchema,
  prepareSendEmailInputSchema, readEmailsInputSchema, readEmailsOutputSchema, searchEmailsInputSchema, searchEmailsOutputSchema,
  sendOutputSchema,
} from "@/src/mcp/tools/schemas";
import { actorHash, requireScope, type MailScope } from "@/src/security/auth";
import { ConfirmationService } from "@/src/security/confirmation";
import { getSecurityStore } from "@/src/security/store";
import { MCP_SERVER_INSTRUCTIONS } from "@/src/security/untrusted-content";

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const modifyingAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const irreversibleAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

function auditActor(authInfo: AuthInfo | undefined): string | undefined {
  const value = authInfo?.extra?.userId;
  return actorHash(typeof value === "string" ? value : authInfo ? undefined : "local-user");
}

function authorized<T extends object>(
  logger: AuditLogger,
  tool: string,
  scope: MailScope,
  authInfo: AuthInfo | undefined,
  counts: { requestedUidCount?: number },
  operation: (userId: string) => Promise<T>,
) {
  return runLoggedTool(logger, tool, counts, auditActor(authInfo), async () => operation(requireScope(authInfo, scope)));
}

export function createMcpServer(
  mailService: MailService = new ImapMailService(),
  logger: AuditLogger = consoleAuditLogger,
  confirmations: ConfirmationService = new ConfirmationService(getSecurityStore(), mailService),
): McpServer {
  const server = new McpServer(
    { name: "mail-mcp", version: "1.0.0" },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );

  server.registerTool("health_check", {
    title: "Health check", description: "Checks server health and optionally IMAP reachability without loading emails.",
    inputSchema: healthCheckInputSchema, outputSchema: healthCheckOutputSchema, annotations: readOnlyAnnotations,
  }, async ({ checkImap }, extra) => authorized(logger, "health_check", "mail.search", extra.authInfo, {}, async () => healthCheck(mailService, checkImap)));

  server.registerTool("list_mailboxes", {
    title: "List mailboxes", description: "Lists folders and special-use metadata without loading messages.",
    inputSchema: listMailboxesInputSchema, outputSchema: listMailboxesOutputSchema, annotations: readOnlyAnnotations,
  }, async (_input, extra) => authorized(logger, "list_mailboxes", "mail.search", extra.authInfo, {}, async () => listMailboxes(mailService)));

  server.registerTool("search_emails", {
    title: "Search email metadata", description: "Searches one mailbox by IMAP UID and returns bounded metadata only.",
    inputSchema: searchEmailsInputSchema, outputSchema: searchEmailsOutputSchema, annotations: readOnlyAnnotations,
  }, async (input, extra) => authorized(logger, "search_emails", "mail.search", extra.authInfo, {}, async () => searchEmails(mailService, input)));

  server.registerTool("read_emails", {
    title: "Read emails", description: "Reads bounded messages by UID, sanitizes HTML and returns attachment metadata only.",
    inputSchema: readEmailsInputSchema, outputSchema: readEmailsOutputSchema, annotations: readOnlyAnnotations,
  }, async (input, extra) => authorized(logger, "read_emails", "mail.read", extra.authInfo, { requestedUidCount: input.uids.length }, async () => readEmails(mailService, input)));

  server.registerTool("mark_email", {
    title: "Mark email", description: "Marks bounded email UIDs as read/unread and/or flagged/unflagged.",
    inputSchema: markEmailInputSchema, outputSchema: mutationOutputSchema, annotations: modifyingAnnotations,
  }, async (input, extra) => authorized(logger, "mark_email", "mail.modify", extra.authInfo, { requestedUidCount: input.uids.length }, async () => markEmail(mailService, input)));

  server.registerTool("move_email", {
    title: "Move email", description: "Moves bounded email UIDs to an explicitly named existing mailbox.",
    inputSchema: moveEmailInputSchema, outputSchema: moveOutputSchema, annotations: modifyingAnnotations,
  }, async (input, extra) => authorized(logger, "move_email", "mail.modify", extra.authInfo, { requestedUidCount: input.uids.length }, async () => moveEmail(mailService, input)));

  server.registerTool("create_mailbox", {
    title: "Create mailbox", description: "Creates one validated IMAP mailbox. It never creates filesystem paths.",
    inputSchema: createMailboxInputSchema, outputSchema: createMailboxOutputSchema, annotations: modifyingAnnotations,
  }, async (input, extra) => authorized(logger, "create_mailbox", "mail.modify", extra.authInfo, {}, async () => createMailbox(mailService, input)));

  server.registerTool("create_draft", {
    title: "Create draft", description: "Creates a text-only draft in the server-identified Drafts mailbox. It does not send email.",
    inputSchema: createDraftInputSchema, outputSchema: draftOutputSchema, annotations: modifyingAnnotations,
  }, async (input, extra) => authorized(logger, "create_draft", "mail.draft", extra.authInfo, {}, async () => createDraft(mailService, input)));

  server.registerTool("prepare_send_email", {
    title: "Prepare email send", description: "Creates a send preview and short-lived one-time confirmation token. It does not send email.",
    inputSchema: prepareSendEmailInputSchema, outputSchema: confirmationOutputSchema, annotations: modifyingAnnotations,
  }, async (input, extra) => authorized(logger, "prepare_send_email", "mail.send", extra.authInfo, {}, async (userId) => prepareSendEmail(confirmations, userId, input)));

  server.registerTool("confirm_send_email", {
    title: "Confirm email send", description: "Consumes a valid one-time confirmation token and sends exactly the previously prepared text email.",
    inputSchema: confirmActionInputSchema, outputSchema: sendOutputSchema, annotations: irreversibleAnnotations,
  }, async (input, extra) => authorized(logger, "confirm_send_email", "mail.send", extra.authInfo, {}, async (userId) => confirmSendEmail(confirmations, userId, input)));

  server.registerTool("prepare_delete_email", {
    title: "Prepare move to Trash", description: "Creates a preview and one-time confirmation token. It does not modify email and never offers permanent deletion.",
    inputSchema: prepareDeleteEmailInputSchema, outputSchema: confirmationOutputSchema, annotations: modifyingAnnotations,
  }, async (input, extra) => authorized(logger, "prepare_delete_email", "mail.delete", extra.authInfo, { requestedUidCount: input.uids.length }, async (userId) => prepareDeleteEmail(confirmations, userId, input)));

  server.registerTool("confirm_delete_email", {
    title: "Confirm move to Trash", description: "Consumes a one-time token and moves the prepared UIDs to the identified Trash mailbox. It never permanently deletes or expunges.",
    inputSchema: confirmActionInputSchema, outputSchema: moveOutputSchema, annotations: irreversibleAnnotations,
  }, async (input, extra) => authorized(logger, "confirm_delete_email", "mail.delete", extra.authInfo, {}, async (userId) => confirmDeleteEmail(confirmations, userId, input)));

  return server;
}
